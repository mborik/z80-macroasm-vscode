import * as vscode from 'vscode';
import { ProcessorResult, SymbolProcessor } from './symbolProcessor';

export class Z80HoverProvider implements vscode.HoverProvider {
	constructor(public symbolProcessor: SymbolProcessor) {}

	provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Thenable<vscode.Hover> {
		return this.symbolProcessor.getFullSymbolAtDocPosition<vscode.Hover>(
			document, position, token, ProcessorResult.HOVER
		);
	}
}
