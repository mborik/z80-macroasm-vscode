import * as vscode from 'vscode';
import { SymbolProcessor } from './symbolProcessor';

export class Z80DefinitionProvider implements vscode.DefinitionProvider {
	constructor(public symbolProcessor: SymbolProcessor) {}

	provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Thenable<vscode.Definition> {
		return this.symbolProcessor.getFullSymbolAtDocPosition<vscode.Definition>(
			document, position, token
		);
	}
}
