import * as vscode from 'vscode';
import { ASMSymbolDocumenter, DocumenterResult, SymbolDescriptor } from './symbolDocumenter';

export class ASMRenameProvider implements vscode.RenameProvider {
	constructor(public symbolDocumenter: ASMSymbolDocumenter) {}

	provideRenameEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		newName: string,
		token: vscode.CancellationToken
	): Thenable<vscode.WorkspaceEdit> {

		return this.symbolDocumenter.getFullSymbolAtDocPosition<SymbolDescriptor>(
			document, position, token, DocumenterResult.SYMBOL
		).then((symbol: SymbolDescriptor) => {
			const wsEdit = new vscode.WorkspaceEdit();

			console.log(newName);
			console.log(symbol);

			return wsEdit;
		});
	}
}
