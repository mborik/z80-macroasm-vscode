import * as vscode from 'vscode';
import { ASMSymbolDocumenter } from './symbolDocumenter';

export class ASMDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	constructor(public symbolDocumenter: ASMSymbolDocumenter) {}

	provideDocumentSymbols(
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): Thenable<vscode.SymbolInformation[]> {

		return this.symbolDocumenter.provideSymbols(document.fileName, null, token);
	}
}

export class ASMWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
	constructor(public symbolDocumenter: ASMSymbolDocumenter) {}

	provideWorkspaceSymbols(
		query: string,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.SymbolInformation[]> {

		return this.symbolDocumenter.provideSymbols(null, query, token);
	}
}
