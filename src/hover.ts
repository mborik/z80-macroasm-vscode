import * as vscode from 'vscode';
import { ASMSymbolDocumenter } from './symbolDocumenter';

export class ASMHoverProvider implements vscode.HoverProvider {
	constructor(public symbolDocumenter: ASMSymbolDocumenter) {}

	provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Hover> {
		const range = document.getWordRangeAtPosition(position);
		const text = document.getText(range);

		return new Promise<vscode.Hover>((resolve, reject) => {
			const symbol = this.symbolDocumenter.symbol(text, document);
			if (symbol && !token.isCancellationRequested) {
				return resolve(new vscode.Hover(new vscode.MarkdownString(symbol.documentation), range));
			}
			reject();
		});
	}
}
