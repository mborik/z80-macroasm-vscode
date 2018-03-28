import * as vscode from 'vscode';
import { ASMSymbolDocumenter } from './symbolDocumenter';

export class ASMDefinitionProvider implements vscode.DefinitionProvider {
	constructor(public symbolDocumenter: ASMSymbolDocumenter) {}

	public provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Thenable<vscode.Definition> {
		const range = document.getWordRangeAtPosition(position);
		const text = document.getText(range);

		return new Promise<vscode.Definition>((resolve, reject) => {
			const symbol = this.symbolDocumenter.symbol(text, document);
			if (symbol && !token.isCancellationRequested) {
				return resolve(symbol.location);
			}
			reject();
		});
	}
}
