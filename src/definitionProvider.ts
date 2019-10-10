import * as vscode from 'vscode';
import { ASMSymbolDocumenter } from './symbolDocumenter';

export class ASMDefinitionProvider implements vscode.DefinitionProvider {
	constructor(public symbolDocumenter: ASMSymbolDocumenter) {}

	provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Thenable<vscode.Definition> {
		return this.symbolDocumenter.getFullSymbolAtDocPosition<vscode.Definition>(
			document, position, token
		);
	}
}
