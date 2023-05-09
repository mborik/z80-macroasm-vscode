import * as vscode from 'vscode';
import { ConfigProps, ConfigPropsProvider } from './configProperties';
import set from './defs_list';
import regex from './defs_regex';
import { SymbolProcessor } from './symbolProcessor';
import {
	isFirstLetterUppercase,
	pad,
	safeSplitStringByChar,
	uppercaseIfNeeded
} from './utils';

interface InstructionMapperProps extends ConfigProps {
	snippet: string;
	uppercase: boolean;
	z80n?: boolean;
	range?: vscode.Range;
}

interface RegisterMapperProps extends ConfigProps {
	snippet: string;
	index: number;
	uppercase: boolean;
	secondArgument?: boolean;
	range?: vscode.Range;
}

export class Z80CompletionProvider extends ConfigPropsProvider implements vscode.CompletionItemProvider {
	constructor(public symbolProcessor: SymbolProcessor) {
		super(symbolProcessor.settings);
	}

	private _instructionMapper({ snippet, uppercase, z80n, range, ...opt }: InstructionMapperProps) {
		const delimiter = snippet.substr(-1);
		snippet = uppercaseIfNeeded(snippet, uppercase).trim();

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
		else if (delimiter === '\n' && opt.splitInstructionsByColon) {
			snip.appendText(opt.eol);
		}
		else {
			snip.appendText(' ');
		}

		snip.appendTabstop(0);

		item.insertText = snip;
		item.commitCharacters = ['\t'];

		if (z80n) {
			item.documentation = new vscode.MarkdownString('(Z80N)');
			item.sortText = `z${snippet}`; // put on bottom...
		}

		if (range) {
			item.range = range;
		}

		return item;
	}

	private _registerMapper({ snippet, uppercase, index, secondArgument, range, ...opt }: RegisterMapperProps) {
		snippet = uppercaseIfNeeded(snippet, uppercase);

		// add space before selected completion, unless user has `formatOnType` enabled,
		// because in that case, formatter already added whitespace before the completion menu is shown.
		const prefix = (!opt.formatOnType && secondArgument && opt.spaceAfterArgument) ? ' ' : '';

		// when `formatOnType` is enabled, we shouldn't add newline after the second argument,
		// because it will create a newline itself while we want Enter key just to confirm the item.
		const suffix = (!opt.formatOnType && secondArgument && opt.splitInstructionsByColon) ? opt.eol : '';

		// commit characters are slightly different for second argument:
		// comma is accepted in addition tab or enter.
		const commitChars = ['\t', '\n'];
		if (!secondArgument) {
			commitChars.unshift(',');
		}

		if (opt.bracketType === 'square' && snippet.indexOf('(') === 0) {
			snippet = snippet.replace('(', '[').replace(')', ']');
		}

		const item = new vscode.CompletionItem(snippet, vscode.CompletionItemKind.Value);
		const snip = new vscode.SnippetString(prefix + snippet.replace('*', '${1:0}'));

		snip.appendText(suffix);
		snip.appendTabstop(0);

		// put on the top of the list...
		item.sortText = `!${pad(index)}`;
		item.insertText = snip;
		item.commitCharacters = commitChars;

		if (range) {
			item.range = range;
		}

		return item;
	}

	private _shouldKeywordUppercase(
		part: string,
		uppercaseKeywords: ConfigProps['uppercaseKeywords']
	) {
		return uppercaseKeywords === 'auto' ?
			isFirstLetterUppercase(part) :
			uppercaseKeywords;
	}

//---------------------------------------------------------------------------------------
	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	) {
		const configProps = this.getConfigProps(document);
		let line = document.lineAt(position.line).text;
		let output: vscode.CompletionItem[] = [];
		let baseIndex = 0;

		const endCommentMatch = regex.endComment.exec(line);
		if (endCommentMatch && endCommentMatch.index < position.character) {
			return;
		}

		const labelMatch = regex.labelDefinition.exec(line);
		if (labelMatch) {
			const [ fullMatch ] = labelMatch;
			baseIndex += fullMatch.length;
			while (/\s/.test(line[baseIndex])) {
				baseIndex++;
			}
			line = line.substring(baseIndex);
		}

		line = line.substring(0, position.character - baseIndex);
		if (!line.trim()) {
			return;
		}

		const { fragment, lastFragmentIndex } =
			safeSplitStringByChar(line, ':').reduce(
				({ currentIndex }, fragment) => ({
					fragment,
					currentIndex: currentIndex + fragment.length + 1, // plus colon size
					lastFragmentIndex: currentIndex,
				}),
				{
					fragment: '',
					currentIndex: baseIndex,
					lastFragmentIndex: 0,
				}
			);

		if (!fragment) {
			return;
		}

		const shouldSuggestInstructionMatch = regex.shouldSuggestInstruction.exec(fragment);
		if (shouldSuggestInstructionMatch) {
			if (!configProps.suggestOnInstructions) {
				vscode.commands.executeCommand('editor.action.triggerSuggest', { auto: false });
			}

			const [ fullMatch,,,, instructionPart ] = shouldSuggestInstructionMatch;
			const uppercase = this._shouldKeywordUppercase(
				instructionPart,
				configProps.uppercaseKeywords
			);

			const range = new vscode.Range(
				position.line, lastFragmentIndex +
					(instructionPart ? fullMatch.lastIndexOf(instructionPart) : fullMatch.length),
				position.line, position.character
			);

			output = [
				...set.instructions.map((snippet) => this._instructionMapper({
					...configProps,
					uppercase,
					snippet,
					range,
				})),
				...set.nextInstructions.map((snippet) => this._instructionMapper({
					...configProps,
					z80n: true,
					uppercase,
					snippet,
					range,
				}))
			];

			if (instructionPart) {
				const instructionToFind = uppercaseIfNeeded(instructionPart, uppercase);
				const preselected = output.find(snip => snip.label.startsWith(instructionToFind));
				if (preselected) {
					preselected.preselect = true;
				}
			}
		}
		else {
			const shouldSuggest1ArgRegisterMatch = regex.shouldSuggest1ArgRegister.exec(fragment);
			const shouldSuggest2ArgRegisterMatch = regex.shouldSuggest2ArgRegister.exec(fragment);
			const shouldSuggestConditionalsMatch = regex.shouldSuggestConditionals.exec(fragment);

			if (shouldSuggest2ArgRegisterMatch) {
				const uppercase = this._shouldKeywordUppercase(
					shouldSuggest2ArgRegisterMatch[1],
					configProps.uppercaseKeywords
				);

				if (shouldSuggest2ArgRegisterMatch[1].toLowerCase() === 'ex' &&
					shouldSuggest2ArgRegisterMatch[2].toLowerCase() === 'af') {

					const text = uppercaseIfNeeded("af'", uppercase);
					const item = new vscode.CompletionItem(text, vscode.CompletionItemKind.Value);
					item.insertText = new vscode.SnippetString(text)
						.appendText(configProps.eol)
						.appendTabstop(0);

					item.commitCharacters = ['\n'];
					return [item];
				}
				else {
					output = set.registers.map((snippet, index) => this._registerMapper({
						...configProps,
						secondArgument: true,
						uppercase,
						snippet,
						index
					}));
				}
			}
			else if (shouldSuggest1ArgRegisterMatch) {
				const {
					index: currentSuggestIndex,
					1: instruction,
					2: instructionR16,
					3: instructionR8
				} = shouldSuggest1ArgRegisterMatch;

				let idxStart = 0, idxEnd = undefined;
				const uppercase = this._shouldKeywordUppercase(
					instruction,
					configProps.uppercaseKeywords
				);

				if (instructionR16) {
					idxStart = set.regR16Index;
					idxEnd = set.regStackIndex;
				}
				else if (instructionR8) {
					idxEnd = set.regR16Index;
				}

				const range = new vscode.Range(
					position.line, lastFragmentIndex + currentSuggestIndex + instruction.length,
					position.line, position.character
				);

				output = set.registers
					.slice(idxStart, idxEnd)
					.map(
						(snippet, index) => this._registerMapper({
							...configProps,
							uppercase,
							snippet,
							index,
							range
						})
					);
			}
			else if (shouldSuggestConditionalsMatch) {
				const { 1: instruction } = shouldSuggestConditionalsMatch;
				const uppercase = this._shouldKeywordUppercase(
					instruction,
					configProps.uppercaseKeywords
				);

				output = set.conditionals.map(
					(snippet, index) => this._registerMapper({
						...configProps,
						uppercase,
						snippet,
						index,
					})
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
					position.line, baseIndex + line.lastIndexOf('.'),
					position.line, position.character
				);
			}

			item.commitCharacters = ['\n'];
			output.push(item);
		}

		return output;
	}
}
