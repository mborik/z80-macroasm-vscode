import * as vscode from 'vscode';
import { SymbolProcessor } from './symbolProcessor';

export class Z80DocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	constructor(public symbolProcessor: SymbolProcessor) {}

	provideDocumentSymbols(
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): Thenable<vscode.SymbolInformation[]> {

		return this.symbolProcessor.provideSymbols(document.fileName, null, token);
	}
}

export class Z80WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
	constructor(public symbolProcessor: SymbolProcessor) {}

	provideWorkspaceSymbols(
		query: string,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.SymbolInformation[]> {

		return this.symbolProcessor.provideSymbols(null, query, token);
	}
}
