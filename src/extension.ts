import * as vscode from 'vscode';
import { ASMHoverProvider } from "./hover";
import { ASMSymbolDocumenter } from "./symbolDocumenter";
import { ASMCompletionProposer } from './completionProposer';
import { ASMDefinitionProvider } from './definitionProvider';
import { ASMRenameProvider } from './renameProvider';
import { ASMDocumentSymbolProvider, ASMWorkspaceSymbolProvider } from './symbolProvider';


let changeConfigSubscription: vscode.Disposable | undefined;
let symbolDocumenter: ASMSymbolDocumenter | undefined;

export function activate(ctx: vscode.ExtensionContext) {
	configure(ctx);

	// subscribe for every configuration change
	changeConfigSubscription = vscode.workspace.onDidChangeConfiguration(event => {
		configure(ctx, event);
	});
}

export function deactivate() {
	if (symbolDocumenter) {
		symbolDocumenter.destroy();
		symbolDocumenter = undefined;
	}
	if (changeConfigSubscription) {
		changeConfigSubscription.dispose();
		changeConfigSubscription = undefined;
	}
}

function configure(ctx: vscode.ExtensionContext, event?: vscode.ConfigurationChangeEvent) {
	const language = 'z80-macroasm';
	const settings = vscode.workspace.getConfiguration(language);
	const languageSelector: vscode.DocumentFilter = { language, scheme: "file" };

	// test if changing specific configuration
	if (event && !event.affectsConfiguration(language)) {
		return;
	}

	// dispose previously created providers
	let provider: vscode.Disposable | undefined;
	while ((provider = ctx.subscriptions.pop()) != null) {
		provider.dispose();
	}

	// dispose previously created symbol documenter
	if (symbolDocumenter) {
		symbolDocumenter.destroy();
	}
	symbolDocumenter = new ASMSymbolDocumenter(settings);

	ctx.subscriptions.push(
		vscode.languages.registerHoverProvider(languageSelector, new ASMHoverProvider(symbolDocumenter)),
		vscode.languages.registerCompletionItemProvider(languageSelector, new ASMCompletionProposer(symbolDocumenter), ',', '.', ' '),
		vscode.languages.registerDefinitionProvider(languageSelector, new ASMDefinitionProvider(symbolDocumenter)),
		vscode.languages.registerDocumentSymbolProvider(languageSelector, new ASMDocumentSymbolProvider(symbolDocumenter)),
		vscode.languages.registerRenameProvider(languageSelector, new ASMRenameProvider(symbolDocumenter)),
		vscode.languages.registerWorkspaceSymbolProvider(new ASMWorkspaceSymbolProvider(symbolDocumenter)),
	);
}
