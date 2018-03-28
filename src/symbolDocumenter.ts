import * as vscode from 'vscode';
import * as path from 'path';

const fileGlobPattern = "**/*.{a80,asm,inc,s}";
const commentLineRegex = /^;+(.*)$/;
const endCommentRegex = /^[^;]+;(.*)$/;
const includeLineRegex = /^include\s+(["'])([^\1]+)\1.*$/i;
const horizontalRuleRegex = /^(.)\1+$/;
const labelDefinitionRegex = /^\@?([\w\.]+)[:\s]/;
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

		vscode.workspace.findFiles(fileGlobPattern, null, undefined)
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
	 * Seeks files that include `fsPath` for symbols.
	 * @param fsPath The path of the file to seek above.
	 * @param output The collection of discovered symbols.
	 * @param searched Paths of files that have already been searched.
	 */
	private _seekSymbolsUp(fsPath: string, output: { [name: string]: SymbolDescriptor }, searched: string[]) {
		for (const filename in this.files) {
			if (this.files.hasOwnProperty(filename)) {
				if (searched.indexOf(filename) != -1) {
					continue;
				}

				const table = this.files[filename];
				if (!table) {
					return;
				}

				if (table.includedFiles.indexOf(fsPath) != -1) {
					this._seekSymbols(filename, output, searched, true);
				}
			}
		}
	}

	/**
	 * Seeks symbols for use by Intellisense in the file at `fsPath`.
	 * @param fsPath The path of the file to seek in.
	 * @param output The collection of discovered symbols.
	 * @param searched Paths of files that have already been searched.
	 * @param searchIncludes If true, also searches file includes.
	 */
	private _seekSymbols(fsPath: string, output: { [name: string]: SymbolDescriptor }, searched: string[], searchIncludes: boolean) {
		const table = this.files[fsPath];

		if (table == undefined) {
			return;
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

		if (searchIncludes) {
			table.includedFiles.forEach((includeFilename) => {
				if (searched.indexOf(includeFilename) == -1) {
					searched.push(includeFilename);

					this._seekSymbols(includeFilename, output, searched, searchIncludes);
				}
			});

			this._seekSymbolsUp(fsPath, output, searched);
		}
	}

	/**
	 * Returns a set of symbols possibly within scope of `context`.
	 * @param context The document to find symbols for.
	 */
	symbols(context: vscode.TextDocument): { [name: string]: SymbolDescriptor } {
		const output: { [name: string]: SymbolDescriptor } = {};

		// First, find all exported symbols in the entire workspace
		for (const filename in this.files) {
			if (this.files.hasOwnProperty(filename)) {
				this._seekSymbols(filename, output, [], false);
			}
		}

		// Next, grab all symbols for this file and included files
		const searchedIncludes: string[] = []
		this._seekSymbols(context.uri.fsPath, output, searchedIncludes, true);

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

	private _document(document: vscode.TextDocument) {
		const table = new FileTable();
		this.files[document.uri.fsPath] = table;

		let commentBuffer: String[] = [];
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
				const labelMatch = labelDefinitionRegex.exec(line.text);

				if (includeLineMatch) {
					const filename = includeLineMatch[1];
					const documentDirname = path.dirname(document.uri.fsPath);
					const includeName = path.join(documentDirname, filename);
					table.includedFiles.push(includeName);
				}
				else if (labelMatch) {
					const declaration = labelMatch[1];
					if (keywordRegex.test(declaration)) {
						continue;
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
