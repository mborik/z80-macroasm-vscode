import * as vscode from 'vscode';
import { ConfigProps, ConfigPropsProvider } from './configProperties';
import { SymbolProcessor } from './symbolProcessor';
import { isFirstLetterUppercase, uppercaseIfNeeded, pad } from './utils';
import regex from './defs_regex';
import set from './defs_list';


export class Z80CompletionProposer extends ConfigPropsProvider implements vscode.CompletionItemProvider {
	constructor(public symbolProcessor: SymbolProcessor) {
		super(symbolProcessor.settings);
	}

	private instructionMapper(opt: ConfigProps, ucase: boolean, z80n: boolean, snippet: string) {
		const delimiter = snippet.substr(-1);
		snippet = uppercaseIfNeeded(snippet, ucase).trim();

		const item = new vscode.CompletionItem(snippet, vscode.CompletionItemKind.Keyword);
		const snip = new vscode.SnippetString(snippet);
		if (delimiter === '\t') {
			if (opt.whitespaceAfterInstruction === 'single-space') {
				snip.appendText(' ');
			}
			else if (opt.whitespaceAfterInstruction === 'tab') {
				snip.appendText('\t');
			}
			else if (opt.indentSpaces) {
				let tabSize = opt.indentSize;
				while (snippet.length > tabSize) {
					tabSize += opt.indentSize;
				}

				snip.appendText(' '.repeat(tabSize - snippet.length));
			}
			else {
				snip.appendText('\t');
			}
		}
		else if (delimiter === '\n') {
			snip.appendText(opt.eol);
		}
		else {
			snip.appendText(delimiter);
		}

		snip.appendTabstop(0);

		item.insertText = snip;
		item.commitCharacters = ['\t'];

		if (z80n) {
			item.documentation = new vscode.MarkdownString('(Z80N)');
			item.sortText = `z${snippet}`; // put on bottom...
		}

		return item;
	}

	private registerMapper(options: ConfigProps & { secondArgument?: boolean },
		ucase: boolean, snippet: string, idx: number) {

		snippet = uppercaseIfNeeded(snippet, ucase);

		// Add space before selected autocompletion, unless user has formatOnType enabled; in this case, formatter will already add the space by the time intellisense menu is shown. If we also let space here, we'll end up with 2 spaces.
		let prefix = '';
		if (options.secondArgument && options.spaceAfterArgument && !options.formatOnType) {
			prefix = ' ';
		}

		// When formatOnType is enabled, don't add newline after the autocomplete, it will also create a new line in the editor where we only want enter to confirm the item.
		let suffix = options.eol;
		if (options.formatOnType) {
			suffix = '';
		}

		// Commit characters are slightly different: for first character, comma is accepted, for second space. And for both tab and enter as well.
		let commitChars = [' ', '\t', '\n'];
		if (!options.secondArgument) {
			commitChars = [',', '\t', '\n'];
		}

		if (options.bracketType === 'square' && snippet.indexOf('(') === 0) {
			snippet = snippet.replace('(', '[').replace(')', ']');
		}

		const item = new vscode.CompletionItem(snippet, vscode.CompletionItemKind.Value);
		const snip = new vscode.SnippetString(prefix + snippet.replace('*', '${1:0}'));

		snip.appendText(suffix);
		snip.appendTabstop(0);

		// put on the top of the list...
		item.sortText = `!${pad(idx)}`;
		item.insertText = snip;
		item.commitCharacters = commitChars;
		return item;
	}

//---------------------------------------------------------------------------------------
	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	) {

		const configProps = this.getConfigProps(document);
		const line: string = document.lineAt(position.line).text;
		const shouldSuggestInstructionMatch = regex.shouldSuggestInstruction.exec(line);

		const shouldKeywordUppercase = (part: string) =>
			configProps.uppercaseKeywords === 'auto' ? isFirstLetterUppercase(part) :
			configProps.uppercaseKeywords as boolean;


		let output: vscode.CompletionItem[] = [];

		if (shouldSuggestInstructionMatch) {
			const uc = shouldKeywordUppercase(shouldSuggestInstructionMatch[4]);

			output = [
				...set.instructions.map(this.instructionMapper.bind(this, configProps, uc, false)),
				...set.nextInstructions.map(this.instructionMapper.bind(this, configProps, uc, true))
			];
		}
		else {
			const shouldSuggest1ArgRegisterMatch = regex.shouldSuggest1ArgRegister.exec(line);
			const shouldSuggest2ArgRegisterMatch = regex.shouldSuggest2ArgRegister.exec(line);

			if (shouldSuggest2ArgRegisterMatch) {
				const uc = shouldKeywordUppercase(shouldSuggest2ArgRegisterMatch[1]);

				if (shouldSuggest2ArgRegisterMatch[1].toLowerCase() === 'ex' &&
					shouldSuggest2ArgRegisterMatch[2].toLowerCase() === 'af') {

					const text = uppercaseIfNeeded("af'", uc);
					const item = new vscode.CompletionItem(text, vscode.CompletionItemKind.Value);
					item.insertText = new vscode.SnippetString(text)
						.appendText(configProps.eol)
						.appendTabstop(0);

					item.commitCharacters = ['\n'];
					return [item];
				}
				else {
					output = set.registers.map(this.registerMapper.bind(this, {
						...configProps,
						secondArgument: true
					}, uc));
				}
			}
			else if (shouldSuggest1ArgRegisterMatch) {
				const uc = shouldKeywordUppercase(shouldSuggest1ArgRegisterMatch[0]);
				let idxStart = 0, idxEnd = undefined;

				if (shouldSuggest1ArgRegisterMatch[1]) {
					idxStart = set.regR16Index;
					idxEnd = set.regStackIndex;
				}
				else if (shouldSuggest1ArgRegisterMatch[2]) {
					idxEnd = set.regR16Index;
				}

				output = set.registers.slice(idxStart, idxEnd).map(
					this.registerMapper.bind(this, configProps, uc)
				);
			}
		}

		const symbols = await this.symbolProcessor.symbols(document);
		if (token.isCancellationRequested) {
			return;
		}

		for (const name in symbols) {
			const symbol = symbols[name];

			// mark a suggested item with proper icon
			let kind = vscode.CompletionItemKind.Variable;

			// suggest also macros in place of instructions
			if (symbol.kind === vscode.SymbolKind.Module) {
				kind = vscode.CompletionItemKind.Module;

				if (shouldSuggestInstructionMatch) {
					continue;
				}
			}
			else if (symbol.kind === vscode.SymbolKind.Function) {
				kind = vscode.CompletionItemKind.Function;
			}
			else if (shouldSuggestInstructionMatch) {
				continue;
			}

			const item = new vscode.CompletionItem(name, kind);
			if (symbol.path.length > 1) {
				item.documentation = new vscode.MarkdownString(symbol.declaration);
			}
			if (symbol.documentation) {
				if (item.documentation instanceof vscode.MarkdownString) {
					item.documentation.appendMarkdown('\n\n' + symbol.documentation);
				}
				else {
					item.documentation = new vscode.MarkdownString(symbol.documentation);
				}
			}

			if (symbol.location.uri.fsPath === document.fileName) {
				// sort symbols by proximity to current line of current file
				const delta = Math.abs(symbol.line - position.line);
				item.sortText = `!z${pad(delta, 10)}`;
			}
			else {
				item.sortText = symbol.declaration;
			}

			if (name[0] === '.' && line.lastIndexOf('.') > 0) {
				item.range = new vscode.Range(
					position.line, line.lastIndexOf('.'),
					position.line, position.character
				);
			}

			item.commitCharacters = ['\n'];
			output.push(item);
		}

		return output;
	}
}
