import * as vscode from 'vscode';
import { ASMHoverProvider } from "./hover";
import { ASMSymbolDocumenter } from "./symbolDocumenter";
import { ASMCompletionProposer } from './completionProposer';
import { ASMDefinitionProvider } from './definitionProvider';

const languageSelector: vscode.DocumentFilter = { language: "z80-macroasm", scheme: "file" };


export function activate(ctx: vscode.ExtensionContext) {
	const symbolDocumenter = new ASMSymbolDocumenter();

	ctx.subscriptions.push(vscode.languages.registerHoverProvider(languageSelector, new ASMHoverProvider(symbolDocumenter)));
	ctx.subscriptions.push(vscode.languages.registerCompletionItemProvider(languageSelector, new ASMCompletionProposer(symbolDocumenter)));
	ctx.subscriptions.push(vscode.languages.registerDefinitionProvider(languageSelector, new ASMDefinitionProvider(symbolDocumenter)));
}

export function deactivate() {}
