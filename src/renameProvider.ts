import * as vscode from 'vscode';
import regex from './defs_regex';
import {
	ASMSymbolDocumenter,
	DocumenterResult,
	SymbolDescriptorExt
} from './symbolDocumenter';

export class ASMRenameProvider implements vscode.RenameProvider {
	constructor(public symbolDocumenter: ASMSymbolDocumenter) {}

	prepareRename(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.ProviderResult<vscode.Range> {

		const lineText = document.lineAt(position.line).text;
		const includeLineMatch = regex.includeLine.exec(lineText);
		if (includeLineMatch) {
			throw 'You cannot rename a include.';
		}

		const commentLineMatch = regex.endComment.exec(lineText);
		if (commentLineMatch && position.character >= commentLineMatch.index) {
			throw 'You cannot rename a comment.';
		}

		let range = document.getWordRangeAtPosition(position, regex.stringBoundsRule);
		if (range && !range.isEmpty) {
			throw 'You cannot rename a string.';
		}

		range = document.getWordRangeAtPosition(position);
		const text = document.getText(range);
		if (regex.keyword.test(text)) {
			throw 'You cannot rename a keyword.';
		}

		if (regex.numeralMultiRule.test(text)) {
			throw 'You cannot rename a numeral.';
		}

		return range;
	}

	provideRenameEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		newName: string,
		token: vscode.CancellationToken
	): Thenable<vscode.WorkspaceEdit> {

		return this.processSymbolAtDocPosition(document, position, newName, token);
	}


	/**
	 * Provide defined symbol for 'Go to Definition' or symbol hovering.
	 * @param document Text document object.
	 * @param position Cursor position.
	 * @param newName Target rename string.
	 * @param token Cancellation token object.
	 * @returns Promise.
	 */
	private async processSymbolAtDocPosition (
		document: vscode.TextDocument,
		position: vscode.Position,
		newName: string,
		token: vscode.CancellationToken): Promise<vscode.WorkspaceEdit> {

		const wsEdit = new vscode.WorkspaceEdit();

		const range = document.getWordRangeAtPosition(position, regex.partialLabelRule);
		if (!range || (range && (range.isEmpty || !range.isSingleLine))) {
			return wsEdit;
		}

		const partialLabelMatch = regex.partialLabelRule.exec(document.getText(range));
		if (!partialLabelMatch ||
			(partialLabelMatch && regex.keyword.test(partialLabelMatch[1]))) {

			return wsEdit;
		}

		const oldName = partialLabelMatch[1];
		const wasLocalLabel = (partialLabelMatch[0][0] === '.');
		let symbol: SymbolDescriptorExt | null = null;

		if (wasLocalLabel) {
			symbol = await this.symbolDocumenter.getFullSymbolAtDocPosition<SymbolDescriptorExt>(
				document, position, token, DocumenterResult.SYMBOL_FULL
			);

			if (token.isCancellationRequested) {
				return wsEdit;
			}
		}

		if (symbol == null) {
			symbol = await this.symbolDocumenter.getFullSymbolAtDocPosition<SymbolDescriptorExt>(
				document, position, token, DocumenterResult.SYMBOL
			);

			if (token.isCancellationRequested) {
				return wsEdit;
			}
		}

		if (symbol == null && !wasLocalLabel) {
			symbol = await this.symbolDocumenter.getFullSymbolAtDocPosition<SymbolDescriptorExt>(
				document, position, token, DocumenterResult.SYMBOL_FULL
			);

			if (token.isCancellationRequested) {
				return wsEdit;
			}
		}

		if (symbol != null && symbol.labelPart) {
			const files = this.symbolDocumenter.filesWithIncludes(document);

			if (token.isCancellationRequested) {
				throw token;
			}

			for (const uri in files) {
				const doc = await vscode.workspace.openTextDocument(uri);

				if (token.isCancellationRequested) {
					throw token;
				}

				let moduleStack: string[] = [];
				let lastFullLabel: string | null = files[uri].labelPath[0];

				for (let lineNumber = 0; lineNumber < doc.lineCount; lineNumber++) {
					const line = doc.lineAt(lineNumber);
					if (!line || line.isEmptyOrWhitespace) {
						continue;
					}

					let lineText = line.text;

					const commentLineMatch = regex.commentLine.exec(lineText);
					const includeLineMatch = regex.includeLine.exec(lineText);
					const moduleLineMatch = regex.moduleLine.exec(lineText);
					const macroLineMatch = regex.macroLine.exec(lineText);
					const labelMatch = regex.labelDefinition.exec(lineText);

					if (commentLineMatch) {
						// skip comment lines
						continue;
					}
					else if (includeLineMatch) {
						// remove include from line to prevent false match
						lineText = lineText.replace(includeLineMatch[0], '');
					}
					else if (macroLineMatch) {
						const macroName = macroLineMatch[2];

						// test if we renaming specific macro
						if (symbol.kind === vscode.SymbolKind.Function && macroName === oldName) {
							const start = macroLineMatch.index + macroLineMatch[1].length;
							const range = new vscode.Range(
								symbol.line, start,
								symbol.line, start + macroName.length
							);

							wsEdit.replace(symbol.location.uri, range, newName);
						}

						// remove macro definition to prevent false match
						lineText = lineText.replace(macroLineMatch[0], '');
					}

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
					}

					if (moduleLineMatch) {
						const declaration = moduleLineMatch[2];

						if (symbol.kind === vscode.SymbolKind.Module && declaration === oldName) {
							const start = line.firstNonWhitespaceCharacterIndex + moduleLineMatch[1].length;
							const range = new vscode.Range(
								lineNumber, start,
								lineNumber, start + declaration.length
							);

							wsEdit.replace(doc.uri, range, newName);
						}

						moduleStack.unshift(declaration);

						// remove module definition to prevent false match
						lineText = lineText.replace(moduleLineMatch[0], '');
					}
					else if (regex.endmoduleRule.test(lineText)) {
						moduleStack.shift();
						continue;
					}

					let replacementPhrase =
						wasLocalLabel ? `(\\b\\w+)?\\.` : `()?\\b`;
					replacementPhrase += oldName + '\\b';

					lineText.replace(RegExp(replacementPhrase, 'g'),
						(match, prefix: string, index: number) => {
							if (symbol == null) {
								return match;
							}

							const localLabel = (match[0] === '.');
							if (localLabel && symbol.labelPart &&
								!symbol.labelPart.endsWith(lastFullLabel + match)) {

								return match;
							}

							let start = index;
							if (prefix) {
								if (match !== symbol.labelPart && prefix !== symbol.path[0]) {
									return match;
								}

								start += prefix.length + 1;
							}
							else if (localLabel) {
								start++;
							}

							const range = new vscode.Range(
								lineNumber, start,
								lineNumber, start + oldName.length
							);

							wsEdit.replace(doc.uri, range, newName);

							return match;
						}
					);
				}
			}
		}

		return wsEdit;
	}
}
