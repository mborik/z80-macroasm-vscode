import * as vscode from 'vscode';
import { ASMSymbolDocumenter } from './symbolDocumenter';

const shouldSuggestInstructionRegex = /^(\@?((\$\$(?!\.))?[\w\.]+)[:\s])?\s*(\w+)?(?!.+)$/;
const shouldSuggest1ArgRegisterRegex = /(?:(pop|push)|(cp|in|s[lr]a|s[lr]l|slia|sub|and|x?or)|(ex|ld|inc|dec|adc|add|sbc))\s+([a-z]\w*|\([^\)]+?\))$/i;
const shouldSuggest2ArgRegisterRegex = /(adc|add|bit|ex|ld|out|res|r[lr]c?|set|s[lr]a|s[lr]l|slia|sbc)\s+(\w+|\([^\)]+?\))(,\s*?\(?[^\(\n]*)$/i;

const instructionSet = [
	'adc\t',  'add\t',  'and\t',  'bit\t',  'call\t', 'ccf\n',  'cp\t',   'cpd\n',
	'cpdr\n', 'cpi\n',  'cpir\n', 'cpl\n',  'daa\n',  'dec\t',  'di\n',   'ei\n',
	'djnz\t', 'ex\t',   'exx\n',  'halt\n', 'im\t',   'in\t',   'inc\t',  'ind\n',
	'indr\n', 'ini\n',  'inir\n', 'jp\t',   'jr\t',   'ld\t',   'ldd\n',  'lddr\n',
	'ldi\n',  'ldir\n', 'neg\n',  'nop\n',  'or\t',   'otdr\n', 'otir\n', 'out\t',
	'outd\n', 'outi\n', 'pop\t',  'push\t', 'res\t',  'ret\t',  'reti\n', 'retn\n',
	'rl\t',   'rla\n',  'rlc\t',  'rlca\n', 'rld\n',  'rr\t',   'rra\n',  'rrc\t',
	'rrca\n', 'rrd\n',  'rst\t',  'sbc\t',  'scf\n',  'set\t',  'sla\t',  'slia\t',
	'sll\t',  'swap\t', 'sra\t',  'srl\t',  'sub\t',  'xor\t'
];

const registerSet = [
	/*  0 */ 'a', 'b', 'c', 'd', 'e', 'h', 'l', 'i', 'r',
	/*  9 */ '(hl)', '(de)', '(bc)', '(ix+*)', '(iy+*)',
	/* 14 */ 'ixl', 'ixh', 'ixu', 'lx', 'hx', 'xl', 'xh',
	/* 21 */ 'iyl', 'iyh', 'iyu', 'ly', 'hy', 'yl', 'yh',
	/* 28 */ 'hl', 'de', 'bc', 'af', 'ix', 'iy',
	/* 34 */ 'sp', '(sp)', '(ix)', '(iy)'
];

export class ASMCompletionProposer implements vscode.CompletionItemProvider {
	constructor(public symbolDocumenter: ASMSymbolDocumenter) {}

	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext
	): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {

		const line: string = document.lineAt(position.line).text;

		if (shouldSuggestInstructionRegex.test(line)) {
			return instructionSet.map(snippet => {
				const item = new vscode.CompletionItem(snippet.trim(), vscode.CompletionItemKind.Keyword);
				item.insertText = new vscode.SnippetString(`${snippet}$0`);
				item.commitCharacters = ['\t'];
				return item;
			});
		}

		let output: vscode.CompletionItem[] = [];

		const shouldSuggest1ArgRegisterMatch = shouldSuggest1ArgRegisterRegex.exec(line);
		const shouldSuggest2ArgRegisterMatch = shouldSuggest2ArgRegisterRegex.exec(line);

		if (shouldSuggest2ArgRegisterMatch) {
			if (shouldSuggest2ArgRegisterMatch[1].toLowerCase() === 'ex' &&
				shouldSuggest2ArgRegisterMatch[2].toLowerCase() === 'af') {

				const item = new vscode.CompletionItem("af'", vscode.CompletionItemKind.Value);
				item.insertText = new vscode.SnippetString(`af'\n$0`);
				item.commitCharacters = ['\n'];

				return [item];
			}
			else {
				output = registerSet.map((snippet, idx) => {
					const item = new vscode.CompletionItem(snippet, vscode.CompletionItemKind.Value);
					item.insertText = new vscode.SnippetString(`${snippet.replace('*', '${1:0}')}\n$0`);
					item.commitCharacters = ['\n'];

					// put to the top of the list...
					item.sortText = `!${idx.toString(36)}`;
					return item;
				});
			}
		}
		else if (shouldSuggest1ArgRegisterMatch) {
			let idxStart = 0, idxEnd = undefined;

			if (shouldSuggest1ArgRegisterMatch[1]) {
				idxStart = 28;
				idxEnd = 33;
			}
			else if (shouldSuggest1ArgRegisterMatch[2]) {
				idxEnd = 27;
			}

			output = registerSet.slice(idxStart, idxEnd).map((snippet, idx) => {
				const item = new vscode.CompletionItem(snippet, vscode.CompletionItemKind.Value);
				item.insertText = new vscode.SnippetString(`${snippet.replace('*', '${1:0}')}\n$0`);
				item.commitCharacters = ['\n'];

				// put to the top of the list...
				item.sortText = `!${idx.toString(36)}`;
				return item;
			});
		}

		const symbols = this.symbolDocumenter.symbols(document);
		for (const name in symbols) {
			if (symbols.hasOwnProperty(name)) {
				const symbol = symbols[name];

				const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
				if (symbol.documentation) {
					item.documentation = new vscode.MarkdownString(symbol.documentation);
				}

				item.sortText = name;
				output.push(item);
			}
		}

		return output;
	}
}
