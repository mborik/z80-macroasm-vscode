import * as vscode from 'vscode';
import * as path from 'path';
import regex from './defs_regex';


class SymbolDescriptor {
	constructor(
		public declaration: string,
		public path: string[],
		public location: vscode.Location,
		public line = location.range.start.line,
		public documentation?: string) {}
}

class IncludeDescriptor {
	constructor(
		public declaration: string,
		public labelPath: string[],
		public fullPath: string,
		public location: vscode.Location,
		public line = location.range.start.line) {}
}

class FileTable {
	includes: IncludeDescriptor[] = [];
	symbols: SymbolDescriptor[] = [];
}

export type SymbolMap = { [name: string]: SymbolDescriptor };

export class ASMSymbolDocumenter {
	private _watcher: vscode.FileSystemWatcher;

	files: { [name: string]: FileTable } = {};


	constructor() {
		const fileGlobPattern = "**/*.{a80,asm,inc,s}";
		const fileUriHandler = ((uri: vscode.Uri) => {
			vscode.workspace.openTextDocument(uri).then(doc => this._document(doc));
		});

		vscode.workspace
			.findFiles(fileGlobPattern)
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
	private async _seekSymbols(fsPath: string, output: SymbolMap,
				prependPath: string[] = [], searched: string[] = []) {

		let table = this.files[fsPath];

		if (!table) {
			// Open missing document and process...
			const doc = await vscode.workspace.openTextDocument(fsPath);

			this._document(doc);
			table = this.files[fsPath];
		}

		searched.push(fsPath);

		table.symbols.forEach(symbol => {
			const fullPath = [ ...prependPath, ...symbol.path ];

			for (let i = fullPath.length - 1; i >= 0; i--) {
				const name = fullPath.slice(i).join('.').replace('..', '.');

				if (!(name in output)) {
					output[name] = symbol;
				}
			}
		});

		table.includes.forEach(async include => {
			if (searched.indexOf(include.fullPath) == -1) {
				this._seekSymbols(include.fullPath, output, include.labelPath, searched);
			}
		});
	}

	/**
	 * Returns an include descriptor within scope of `context` on given `line`.
	 * @param context The document to find symbols for.
	 * @param declaration relative path
	 * @param line
	 */
	private _getInclude(context: vscode.TextDocument, declaration: string, line: number) {
		const fsPath = context.uri.fsPath;
		const table = this.files[fsPath];

		if (table) {
			const include = table.includes.find(i => (i.declaration === declaration && i.line === line));

			if (include) {
				const doc = vscode.Uri.file(include.fullPath);
				const range = new vscode.Range(0, 0, 0, 0);

				return {
					...include,
					destLocation: new vscode.Location(doc, range)
				};
			}
		}

		return null;
	}

	/**
	 * Returns a set of symbols possibly within scope of `context`.
	 * @param context The document to find symbols for.
	 */
	symbols(context: vscode.TextDocument): SymbolMap {
		const output: SymbolMap = {};
		this._seekSymbols(context.uri.fsPath, output);

		return output;
	}

	/**
	 * Provide a list of symbols for both 'Go to Symbol in...' functions.
	 * @param fileFilter (optional) URI of specific file in workspace.
	 * @param query (optional) Part of string to find in symbol name.
	 * @param token Cancellation token object.
	 * @returns Promise of SymbolInformation objects array.
	 */
	provideSymbols (
		fileFilter: string | null,
		query: string | null,
		token: vscode.CancellationToken
	): Promise<vscode.SymbolInformation[]> {

		return new Promise<vscode.SymbolInformation[]>((resolve, reject) => {
			if (token.isCancellationRequested) {
				reject();
			}

			const output: vscode.SymbolInformation[] = [];

			for (const fileName in this.files) {
				if (!fileFilter || fileFilter === fileName) {
					const table = this.files[fileName];

					table.symbols.forEach(symbol => {
						if (!query || ~symbol.declaration.indexOf(query)) {
							output.push(new vscode.SymbolInformation(
								symbol.declaration, vscode.SymbolKind.Variable,
								symbol.location.range, symbol.location.uri
							));
						}
					});
				}
			}

			if (output.length > 0) {
				resolve(output);
			}

			reject();
		});
	}

	/**
	 * Provide defined symbol for 'Go to Definition' or symbol hovering.
	 * @param doc Text document object.
	 * @param position Cursor position.
	 * @param token Cancellation token object.
	 * @param hoverDocumentation Provide a hover object.
	 * @returns Promise of T.
	 */
	getFullSymbolAtDocPosition<T = vscode.Definition | vscode.Hover> (
		doc: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		hoverDocumentation: boolean = false): Promise<T> {

		return new Promise<T>((resolve: (arg0: any) => void, reject) => {
			const lineText = doc.lineAt(position.line).text;
			const includeLineMatch = regex.includeLine.exec(lineText);

			if (includeLineMatch) {
				const include = this._getInclude(doc, includeLineMatch[4], position.line);

				if (include) {
					if (position.character >= include.location.range.start.character &&
						position.character <= include.location.range.end.character) {

						if (hoverDocumentation) {
							return resolve(new vscode.Hover(include.fullPath, include.location.range));
						}
						else {
							return resolve(include.destLocation);
						}
					}
				}
				else {
					return reject();
				}
			}

			const range = doc.getWordRangeAtPosition(position, regex.labelPhraseRule);
			if (!range || (range && (range.isEmpty || !range.isSingleLine || range.start.character === 0))) {
				return reject();
			}

			let lbPart = doc.getText(range);
			if (regex.keyword.test(lbPart)) {
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
					const parentLabelMatch = line.text.match(regex.parentLabel);
					if (parentLabelMatch) {
						lbParent = parentLabelMatch[1];
					}
				}
				const moduleLineMatch = line.text.match(regex.moduleLine);
				if (moduleLineMatch) {
					lbModule = moduleLineMatch[1];
					break;
				}
			}

			lbFull = this._enlargeLabel(this._enlargeLabel(lbFull, lbParent), lbModule);

			const symbols = this.symbols(doc);
			const symbol = symbols[lbFull] || symbols[lbPart];
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

			const commentLineMatch = regex.commentLine.exec(line.text);
			if (commentLineMatch) {
				const baseLine = commentLineMatch[1].trim();

				if (regex.horizontalRule.test(baseLine)) {
					continue;
				}

				commentBuffer.push(baseLine);
			}
			else {
				const includeLineMatch = regex.includeLine.exec(line.text);
				const moduleLineMatch = regex.moduleLine.exec(line.text);
				const macroLineMatch = regex.macroLine.exec(line.text);
				const labelMatch = regex.labelDefinition.exec(line.text);
				let labelPath = [];

				if (labelMatch) {
					labelPath.push(labelMatch[1]);

					let declaration = labelMatch[1];
					if (declaration[0] === '.') {
						if (lastFullLabel) {
							labelPath.unshift(lastFullLabel);
							declaration = lastFullLabel + declaration;
						}
					}
					else if (declaration.indexOf('$$') < 0) {
						lastFullLabel = declaration;
					}

					if (moduleStack.length && labelMatch[0][0] !== '@') {
						labelPath.unshift(moduleStack[0]);
						declaration = `${moduleStack[0]}.${declaration}`;
					}

					const location = new vscode.Location(document.uri, line.range.start);
					const defineExpressionMatch = regex.defineExpression.exec(line.text);
					const evalExpressionMatch = regex.evalExpression.exec(line.text);
					const endCommentMatch = regex.endComment.exec(line.text);

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

					table.symbols.push(new SymbolDescriptor(
						declaration,
						labelPath,
						location,
						lineNumber,
						commentBuffer.join("\n").trim() || undefined
					));
				}

				const pathFragment = [  ...moduleStack.slice(0, 1), ...labelPath.slice(-1) ];

				if (includeLineMatch) {
					const filename = includeLineMatch[4];
					const documentDirname = path.dirname(document.uri.fsPath);
					const includeName = path.join(documentDirname, filename);

					let pos = includeLineMatch.index + includeLineMatch[1].length;
					const linePos1 = new vscode.Position(lineNumber, pos);

					pos += includeLineMatch[2].length;
					const linePos2 = new vscode.Position(lineNumber, pos);

					const range = new vscode.Range(linePos1, linePos2);
					const location = new vscode.Location(document.uri, range);

					table.includes.push(new IncludeDescriptor(
						filename,
						pathFragment,
						includeName,
						location,
						lineNumber
					));
				}
				else if (macroLineMatch) {
					const declaration = macroLineMatch[1];
					const location = new vscode.Location(document.uri, line.range.start);
					const endCommentMatch = regex.endComment.exec(line.text);
					if (endCommentMatch) {
						commentBuffer.unshift(endCommentMatch[1].trim());
					}

					if (macroLineMatch[2]) {
						commentBuffer.unshift("\`" + macroLineMatch[2].trim() + "`\n");
					}

					commentBuffer.unshift(`**macro ${declaration}**`);
					pathFragment.push(declaration);

					table.symbols.push(new SymbolDescriptor(
						declaration,
						pathFragment,
						location,
						lineNumber,
						commentBuffer.join("\n").trim()
					));
				}
				else if (moduleLineMatch) {
					moduleStack.unshift(moduleLineMatch[1]);
				}
				else if (regex.endmoduleRule.test(line.text)) {
					moduleStack.shift();
				}

				commentBuffer = [];
			}
		}
	}
}
