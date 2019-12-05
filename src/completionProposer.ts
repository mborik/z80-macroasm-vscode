import * as vscode from 'vscode';
import { ASMSymbolDocumenter } from './symbolDocumenter';
import { isFirstLetterUppercase, uppercaseIfNeeded, pad } from './utils';
import regex from './defs_regex';
import set from './defs_list';

interface EditorOptions {
	indent_spaces: boolean;
	indent_size: number;
	eol: string;
}


export class ASMCompletionProposer implements vscode.CompletionItemProvider {
	constructor(public symbolDocumenter: ASMSymbolDocumenter) {}

	private getEditorOptions(document: vscode.TextDocument) {
		const config = vscode.workspace.getConfiguration();

		const result: EditorOptions = {
			indent_spaces: (config.editor.insertSpaces === 'true'),
			indent_size: parseInt(config.editor.tabSize as any, 10) || 8,
			eol: (config.files.eol === vscode.EndOfLine.CRLF) ? '\r\n' : '\n'
		};

		// if this document is open, use the settings from that window
		vscode.window.visibleTextEditors.some(editor => {
			if (editor.document && editor.document.fileName === document.fileName) {
				result.indent_spaces = (editor.options.insertSpaces === true);
				result.indent_size = parseInt(editor.options.tabSize as any, 10) || 8;
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
		if (delimiter === '\t' && opt.indent_spaces) {
			let tabSize = opt.indent_size;
			while (snippet.length > tabSize)
				tabSize += opt.indent_size;

			snip.appendText(' '.repeat(tabSize - snippet.length));
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

	private registerMapper(eol: string, ucase: boolean, snippet: string, idx: number) {
		snippet = uppercaseIfNeeded(snippet, ucase);

		const item = new vscode.CompletionItem(snippet, vscode.CompletionItemKind.Value);
		const snip = new vscode.SnippetString(snippet.replace('*', '${1:0}'));

		snip.appendText(eol)
		snip.appendTabstop(0);

		// put on the top of the list...
		item.sortText = `!${pad(idx)}`;
		item.insertText = snip;
		item.commitCharacters = ['\n'];
		return item;
	}

//---------------------------------------------------------------------------------------
	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext
	): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {

		const editorOptions = this.getEditorOptions(document);
		const line: string = document.lineAt(position.line).text;
		const shouldSuggestInstructionMatch = regex.shouldSuggestInstruction.exec(line);

		if (shouldSuggestInstructionMatch) {
			const uc = isFirstLetterUppercase(shouldSuggestInstructionMatch[4]);

			return [
				...set.instructions.map(this.instructionMapper.bind(this, editorOptions, uc, false)),
				...set.nextInstructions.map(this.instructionMapper.bind(this, editorOptions, uc, true))
			];
		}

		let output: vscode.CompletionItem[] = [];

		const shouldSuggest1ArgRegisterMatch = regex.shouldSuggest1ArgRegister.exec(line);
		const shouldSuggest2ArgRegisterMatch = regex.shouldSuggest2ArgRegister.exec(line);

		if (shouldSuggest2ArgRegisterMatch) {
			const uc = isFirstLetterUppercase(shouldSuggest2ArgRegisterMatch[1]);

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
				output = set.registers.map(this.registerMapper.bind(this, editorOptions.eol, uc));
			}
		}
		else if (shouldSuggest1ArgRegisterMatch) {
			const uc = isFirstLetterUppercase(shouldSuggest1ArgRegisterMatch[0]);
			let idxStart = 0, idxEnd = undefined;

			if (shouldSuggest1ArgRegisterMatch[1]) {
				idxStart = set.regR16Index;
				idxEnd = set.regStackIndex;
			}
			else if (shouldSuggest1ArgRegisterMatch[2]) {
				idxEnd = set.regR16Index;
			}

			output = set.registers.slice(idxStart, idxEnd).map(
				this.registerMapper.bind(this, editorOptions.eol, uc)
			);
		}

		const symbols = this.symbolDocumenter.symbols(document);
		for (const name in symbols) {
			const symbol = symbols[name];

			const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
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
					new vscode.Position(position.line, line.lastIndexOf('.')),
					new vscode.Position(position.line, position.character)
				);
			}

			item.commitCharacters = ['\n'];
			output.push(item);
		}

		return output;
	}
}
