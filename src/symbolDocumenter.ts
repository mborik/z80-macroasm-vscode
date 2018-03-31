import * as vscode from 'vscode';
import * as path from 'path';

const fileGlobPattern = "**/*.{a80,asm,inc,s}";
const commentLineRegex = /^;+(.*)$/;
const endCommentRegex = /^[^;]+;(.*)$/;
const includeLineRegex = /\binclude\s+(["'])([^\1]+)\1.*$/i;
const moduleLineRegex = /\bmodule\s+(\w+)\b/i;
const horizontalRuleRegex = /^(.)\1+$/;
const labelDefinitionRegex = /^\@?((\$\$(?!\.))?[\w\.]+)[:\s]/;
const parentLabelRegex = /^(((\@|\$\$)(?!\.))?\w[\w\.]*)[:\s]/;
const evalExpressionRegex = /^\@?([\w\.]+)\:?\s+(=|equ|eval)\s+(.+)(;.*)?$/i;
const defineExpressionRegex = /^\@?([\w\.]+)\:?\s+(inc(?:bin|hob|trd)|b?include|insert|binary|def[bdlmsw]|d[bcdszw]|abyte[cz]?|byte|word|dword)\s+([^$;]+)(;.*)?$/i;
const keywordRegex = /^(equ|eval|org|end?t|align|phase|dephase|unphase|shift|save(?:bin|hob|sna|tap|trd)|emptytrd|inc(?:bin|hob|trd)|b?include|insert|binary|end|output|fpos|page|slot|size|cpu|device|encoding|charset|proc|macro|local|shared|public|rept|dup|block|endm|endp|edup|exitm|module|endmod(?:ule)?|define|undefine|export|disp|textarea|map|field|defarray|assert|fatal|error|warning|message|display|shellexec|def[bdlmsw]|d[bcdszw]|abyte[cz]?|byte|word|dword|if|ifdef|ifndef|ifused|ifnused|else|elseif|endif|adc|add|and|bit|call|ccf|cp|cpdr?|cpir?|cpl|daa|dec|[de]i|djnz|exx?|halt|im|in|inc|indr?|inir?|j[pr]|ld|lddr?|ldir?|neg|nop|or|ot[di]r|out|out[di]|pop|push|res|ret[in]?|rl|rla|rlc|rlca|rld|rr|rra|rrc|rrca|rrd|rst|sbc|scf|set|sli?a|sll|swap|sra|srl|sub|xor)$/i;


class SymbolDescriptor {
	constructor(
		public location: vscode.Location,
		public documentation?: string) {}
}

class FileTable {
	includedFiles: string[]
	symbols: { [name: string]: SymbolDescriptor }

	constructor() {
		this.includedFiles = [];
		this.symbols = {};
	}
}

export class ASMSymbolDocumenter {
	private _watcher: vscode.FileSystemWatcher;

	files: { [name: string]: FileTable };
	constructor() {
		this.files = {};

		const fileUriHandler = ((uri: vscode.Uri) => {
			vscode.workspace.openTextDocument(uri).then(doc => this._document(doc));
		});

		vscode.workspace.findFiles(fileGlobPattern)
			.then(files => files.forEach(fileUriHandler));

		vscode.workspace.onDidChangeTextDocument(
			(event: vscode.TextDocumentChangeEvent) => this._document(event.document)
		);

		this._watcher = vscode.workspace.createFileSystemWatcher(fileGlobPattern);
		this._watcher.onDidChange(fileUriHandler);
		this._watcher.onDidCreate(fileUriHandler);
		this._watcher.onDidDelete((uri) => {
			delete this.files[uri.fsPath];
		});
	}

	destroy() {
		this._watcher.dispose();
	}

	/**
	 * Seeks symbols for use by Intellisense in the file at `fsPath`.
	 * @param fsPath The path of the file to seek in.
	 * @param output The collection of discovered symbols.
	 * @param searched Paths of files that have already been searched.
	 * @param searchIncludes If true, also searches file includes.
	 */
	private async _seekSymbols(fsPath: string, output: { [name: string]: SymbolDescriptor }, searched: string[]) {
		let table = this.files[fsPath];

		if (!table) {
			// Open missing document and process...
			const doc = await vscode.workspace.openTextDocument(fsPath);

			this._document(doc);
			table = this.files[fsPath];
		}

		searched.push(fsPath);

		for (const name in table.symbols) {
			if (table.symbols.hasOwnProperty(name)) {
				const symbol = table.symbols[name];
				if (!(name in output)) {
					output[name] = symbol;
				}
			}
		}

		table.includedFiles.forEach((includeFilename) => {
			if (searched.indexOf(includeFilename) == -1) {
				this._seekSymbols(includeFilename, output, searched);
			}
		});
	}

	/**
	 * Returns a set of symbols possibly within scope of `context`.
	 * @param context The document to find symbols for.
	 */
	symbols(context: vscode.TextDocument): { [name: string]: SymbolDescriptor } {
		const output: { [name: string]: SymbolDescriptor } = {};
		const searchedIncludes: string[] = [];

		this._seekSymbols(context.uri.fsPath, output, searchedIncludes);

		return output;
	}

	/**
	 * Returns a `SymbolDescriptor` for the symbol having `name`, or `undefined`
	 * if no such symbol exists.
	 * @param name The name of the symbol.
	 * @param searchContext The document to find the symbol in.
	 */
	symbol(name: string, searchContext: vscode.TextDocument): SymbolDescriptor | undefined {
		return this.symbols(searchContext)[name];
	}

	getFullSymbolAtDocPosition<T> (
		doc: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		hoverDocumentation: boolean = false): Promise<T> {

		return new Promise<T>((resolve, reject) => {
			const range = doc.getWordRangeAtPosition(position, /((\$\$(?!\.))?[\w\.]+)/);
			if (!range || (range && (range.isEmpty || !range.isSingleLine || range.start.character === 0))) {
				return reject();
			}

			let lbPart = doc.getText(range);
			if (keywordRegex.test(lbPart)) {
				return reject();
			}

			let lbFull = lbPart;
			let lbParent: string | undefined = undefined;
			let lbModule: string | undefined = undefined;

			for (let lineNumber = position.line - 1; lineNumber >= 0; lineNumber--) {
				let line = doc.lineAt(lineNumber);
				if (line.isEmptyOrWhitespace) {
					continue;
				}
				if (lbPart[0] === '.' && !lbParent) {
					const parentLabelMatch = line.text.match(parentLabelRegex);
					if (parentLabelMatch) {
						lbParent = parentLabelMatch[1];
					}
				}
				const moduleLineMatch = line.text.match(moduleLineRegex);
				if (moduleLineMatch) {
					lbModule = moduleLineMatch[1];
					break;
				}
			}

			lbFull = this._enlargeLabel(this._enlargeLabel(lbFull, lbParent), lbModule);

			const symbol = this.symbol(lbFull, doc) || this.symbol(lbPart, doc);
			if (symbol && !token.isCancellationRequested) {
				let result: any;
				if (hoverDocumentation) {
					result = new vscode.Hover(new vscode.MarkdownString(symbol.documentation), range);
				}
				else {
					result = symbol.location;
				}

				return resolve(result);
			}

			reject();
		});
	}

	private _enlargeLabel(base: string, prepend?: string): string {
		if (prepend && base.indexOf(prepend) < 0) {
			if (base[0] === '.') {
				base = prepend + base;
			}
			else {
				base = `${prepend}.${base}`;
			}
		}
		return base;
	}

	private _document(document: vscode.TextDocument) {
		const table = new FileTable();
		this.files[document.uri.fsPath] = table;

		let moduleStack: string[] = [];
		let commentBuffer: string[] = [];
		let lastFullLabel: string | null = null;

		for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
			const line = document.lineAt(lineNumber);
			if (line.isEmptyOrWhitespace) {
				continue;
			}

			const commentLineMatch = commentLineRegex.exec(line.text);
			if (commentLineMatch) {
				const baseLine = commentLineMatch[1].trim();

				if (horizontalRuleRegex.test(baseLine)) {
					continue;
				}

				commentBuffer.push(baseLine);
			}
			else {
				const includeLineMatch = includeLineRegex.exec(line.text);
				const moduleLineMatch = moduleLineRegex.exec(line.text);
				const labelMatch = labelDefinitionRegex.exec(line.text);

				if (includeLineMatch) {
					const filename = includeLineMatch[2];
					const documentDirname = path.dirname(document.uri.fsPath);
					const includeName = path.join(documentDirname, filename);
					table.includedFiles.push(includeName);
				}
				else if (moduleLineMatch) {
					moduleStack.unshift(moduleLineMatch[1]);
				}
				else if (/\bendmod(ule)?\b/i.test(line.text)) {
					moduleStack.shift();
				}
				else if (labelMatch) {
					let declaration = labelMatch[1];
					if (declaration[0] === '.') {
						if (lastFullLabel) {
							declaration = lastFullLabel + declaration;
						}
					}
					else if (declaration.indexOf('$$') < 0) {
						lastFullLabel = declaration;
					}

					if (moduleStack.length && labelMatch[0][0] !== '@') {
						declaration = `${moduleStack[0]}.${declaration}`;
					}

					const location = new vscode.Location(document.uri, line.range.start);
					const defineExpressionMatch = defineExpressionRegex.exec(line.text);
					const evalExpressionMatch = evalExpressionRegex.exec(line.text);
					const endCommentMatch = endCommentRegex.exec(line.text);

					if (defineExpressionMatch) {
						let instruction = (defineExpressionMatch[2] + " ".repeat(8)).substr(0, 8);
						commentBuffer.push("\n```\n" + instruction + defineExpressionMatch[3].trim() + "\n```");
					}
					else if (evalExpressionMatch) {
						commentBuffer.push("\n`" + evalExpressionMatch[3].trim() + "`");
					}

					if (endCommentMatch) {
						commentBuffer.unshift(endCommentMatch[1].trim());
					}

					table.symbols[declaration] = new SymbolDescriptor(
						location,
						commentBuffer.join("\n").trim() || undefined
					);
				}

				commentBuffer = [];
			}
		}
	}
}
