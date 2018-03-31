import * as vscode from 'vscode';
import { ASMSymbolDocumenter } from './symbolDocumenter';

const instructionSet = [
	"adc\t",  "add\t",  "and\t",  "bit\t",  "ccf\n",  "cp\t",   "cpd\n",  "cpdr\n",
	"cpi\n",  "cpir\n", "cpl\n",  "daa\n",  "dec\t",  "di\n",   "ei\n",   "djnz\t",
	"ex\t",   "exx\n",  "halt\n", "im\t",   "in\t",   "inc\t",  "ind\n",  "indr\n",
	"ini\n",  "inir\n", "ld\t",   "ldd\n",  "lddr\n", "ldi\n",  "ldir\n", "neg\n",
	"nop\n",  "or\t",   "otdr\n", "otir\n", "out\t",  "outd\n", "outi\n", "pop\t",
	"push\t", "res\t",  "ret\n",  "reti\n", "retn\n", "rl\t",   "rla\n",  "rlc\t",
	"rlca\n", "rld\n",  "rr\t",   "rra\n",  "rrc\t",  "rrca\n", "rrd\n",  "rst\t",
	"sbc\t",  "scf\n",  "set\t",  "sla\t",  "slia\t", "sll\t",  "swap\t", "sra\t",
	"srl\t",  "sub\t",  "xor\t"
];

export class ASMCompletionProposer implements vscode.CompletionItemProvider {
	constructor(public symbolDocumenter: ASMSymbolDocumenter) {}

	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext
	): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {

		let output: vscode.CompletionItem[] = instructionSet.map(opcode => {
			const item = new vscode.CompletionItem(opcode.trim(), vscode.CompletionItemKind.Keyword);
			item.insertText = new vscode.SnippetString(`${opcode}$0`);
			item.commitCharacters = ["\t"];
			return item;
		});

		const symbols = this.symbolDocumenter.symbols(document);
		for (const name in symbols) {
			if (symbols.hasOwnProperty(name)) {
				const symbol = symbols[name];

				const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
				if (symbol.documentation) {
					item.documentation = new vscode.MarkdownString(symbol.documentation);
				}

				output.push(item);
			}
		}

		return output;
	}
}
