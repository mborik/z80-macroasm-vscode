import * as vscode from 'vscode';
import { SymbolProcessor } from './symbolProcessor';
import { isFirstLetterUppercase, uppercaseIfNeeded, pad } from './utils';
import regex from './defs_regex';
import set from './defs_list';

interface EditorOptions {
	indentSpaces: boolean;
	indentSize: number;
	eol: string;
	whitespaceAfterInstruction: 'auto' |  'tab' | 'single-space';
	spaceAfterFirstArgument: boolean;
	uppercaseKeywords: 'auto' | boolean;
	bracketType: 'round' | 'square';
}


export class Z80CompletionProposer implements vscode.CompletionItemProvider {
	constructor(public symbolProcessor: SymbolProcessor) {}

	private getEditorOptions(document: vscode.TextDocument) {
		const config = vscode.workspace.getConfiguration();

		const result: EditorOptions = {
			...this.symbolProcessor.settings?.format,

			indentSpaces: (config.editor.insertSpaces === 'true'),
			indentSize: parseInt(config.editor.tabSize as any, 10) || 8,
			eol: (config.files.eol === vscode.EndOfLine.CRLF) ? '\r\n' : '\n'
		};

		// if this document is open, use the settings from that window
		vscode.window.visibleTextEditors.some(editor => {
			if (editor.document && editor.document.fileName === document.fileName) {
				result.indentSpaces = (editor.options.insertSpaces === true);
				result.indentSize = parseInt(editor.options.tabSize as any, 10) || 8;
				result.eol = (editor.document.eol === vscode.EndOfLine.CRLF) ? '\r\n' : '\n';
				return true;
			}
			return false;
		});

		return result;
	}

	private instructionMapper(opt: EditorOptions, ucase: boolean, z80n: boolean, snippet: string) {
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
				while (snippet.length > tabSize)
					tabSize += opt.indentSize;

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

	private registerMapper(options: EditorOptions & { secondArgument?: boolean },
			ucase: boolean, snippet: string, idx: number) {

		snippet = uppercaseIfNeeded(snippet, ucase);

		let prefix = '';
		if (options.secondArgument && options.spaceAfterFirstArgument) {
			prefix = ' ';
		}

		if (options.bracketType === 'square' && snippet.indexOf('(') === 0) {
			snippet = snippet.replace('(', '[').replace(')', ']');
		}

		const item = new vscode.CompletionItem(snippet, vscode.CompletionItemKind.Value);
		const snip = new vscode.SnippetString(prefix + snippet.replace('*', '${1:0}'));

		snip.appendText(options.eol)
		snip.appendTabstop(0);

		// put on the top of the list...
		item.sortText = `!${pad(idx)}`;
		item.insertText = snip;
		item.commitCharacters = ['\n'];
		return item;
	}

//---------------------------------------------------------------------------------------
	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext
	) {

		const editorOptions = this.getEditorOptions(document);
		const line: string = document.lineAt(position.line).text;
		const shouldSuggestInstructionMatch = regex.shouldSuggestInstruction.exec(line);

		const shouldKeywordUppercase = (part: string) =>
			editorOptions.uppercaseKeywords === 'auto' ? isFirstLetterUppercase(part) :
			editorOptions.uppercaseKeywords as boolean;

		let output: vscode.CompletionItem[] = [];

		if (shouldSuggestInstructionMatch) {
			const uc = shouldKeywordUppercase(shouldSuggestInstructionMatch[4]);

			output = [
				...set.instructions.map(this.instructionMapper.bind(this, editorOptions, uc, false)),
				...set.nextInstructions.map(this.instructionMapper.bind(this, editorOptions, uc, true))
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
						.appendText(editorOptions.eol)
						.appendTabstop(0);

					item.commitCharacters = ['\n'];
					return [item];
				}
				else {
					output = set.registers.map(this.registerMapper.bind(this, {
						...editorOptions,
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
					this.registerMapper.bind(this, editorOptions, uc)
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
					item.documentation.appendMarkdown("\n\n"+ symbol.documentation);
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
