import * as vscode from 'vscode';
import { SymbolProcessor } from "./symbolProcessor";
import { Z80CompletionProposer } from './completionProposer';
import { Z80DefinitionProvider } from './definitionProvider';
import { Z80HoverProvider } from "./hover";
import { Z80RenameProvider } from './renameProvider';
import { Z80DocumentSymbolProvider, Z80WorkspaceSymbolProvider } from './symbolProvider';


let changeConfigSubscription: vscode.Disposable | undefined;
let symbolProcessor: SymbolProcessor | undefined;

export function activate(ctx: vscode.ExtensionContext) {
	configure(ctx);

	// subscribe for every configuration change
	changeConfigSubscription = vscode.workspace.onDidChangeConfiguration(event => {
		configure(ctx, event);
	});
}

export function deactivate() {
	if (symbolProcessor) {
		symbolProcessor.destroy();
		symbolProcessor = undefined;
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
	if (event && symbolProcessor) {
		if (event.affectsConfiguration(language)) {
			symbolProcessor.settings = settings;
		}

		return;
	}

	// dispose previously created providers
	let provider: vscode.Disposable | undefined;
	while ((provider = ctx.subscriptions.pop()) != null) {
		provider.dispose();
	}

	// dispose previously created symbol processor
	if (symbolProcessor) {
		symbolProcessor.destroy();
	}
	symbolProcessor = new SymbolProcessor(settings);

	// create subscriptions for all providers
	ctx.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(languageSelector, new Z80CompletionProposer(symbolProcessor), ',', '.', ' '),
		vscode.languages.registerDefinitionProvider(languageSelector, new Z80DefinitionProvider(symbolProcessor)),
		vscode.languages.registerDocumentSymbolProvider(languageSelector, new Z80DocumentSymbolProvider(symbolProcessor)),
		vscode.languages.registerHoverProvider(languageSelector, new Z80HoverProvider(symbolProcessor)),
		vscode.languages.registerRenameProvider(languageSelector, new Z80RenameProvider(symbolProcessor)),
		vscode.languages.registerWorkspaceSymbolProvider(new Z80WorkspaceSymbolProvider(symbolProcessor)),
	);
}
