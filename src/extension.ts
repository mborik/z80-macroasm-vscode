import * as vscode from 'vscode';
import { ASMHoverProvider } from "./hover";
import { ASMSymbolDocumenter } from "./symbolDocumenter";
import { ASMCompletionProposer } from './completionProposer';
import { ASMDefinitionProvider } from './definitionProvider';
import { ASMDocumentSymbolProvider, ASMWorkspaceSymbolProvider } from './symbolProvider';

let symbolDocumenter: ASMSymbolDocumenter | undefined;

export function activate(ctx: vscode.ExtensionContext) {
	const languageSelector: vscode.DocumentFilter = { language: "z80-macroasm", scheme: "file" };

	symbolDocumenter = new ASMSymbolDocumenter();

	ctx.subscriptions.push(vscode.languages.registerHoverProvider(languageSelector, new ASMHoverProvider(symbolDocumenter)));
	ctx.subscriptions.push(vscode.languages.registerCompletionItemProvider(languageSelector, new ASMCompletionProposer(symbolDocumenter), ','));
	ctx.subscriptions.push(vscode.languages.registerDefinitionProvider(languageSelector, new ASMDefinitionProvider(symbolDocumenter)));
	ctx.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(languageSelector, new ASMDocumentSymbolProvider(symbolDocumenter)));
	ctx.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new ASMWorkspaceSymbolProvider(symbolDocumenter)));
}

export function deactivate() {
	if (symbolDocumenter) {
		symbolDocumenter.destroy();
		symbolDocumenter = undefined;
	}
}
