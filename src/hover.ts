import * as vscode from 'vscode';
import { ASMSymbolDocumenter, DocumenterResult } from './symbolDocumenter';

export class ASMHoverProvider implements vscode.HoverProvider {
	constructor(public symbolDocumenter: ASMSymbolDocumenter) {}

	provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Thenable<vscode.Hover> {
		return this.symbolDocumenter.getFullSymbolAtDocPosition<vscode.Hover>(
			document, position, token, DocumenterResult.HOVER
		);
	}
}
