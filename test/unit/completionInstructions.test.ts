import * as assert from 'assert';
import * as vscode from 'vscode';
import { Z80CompletionProvider } from '../../src/completionProvider';
import { SymbolProcessor } from '../../src/symbolProcessor';
import set from '../../src/defs_list';
import { executedCommands } from './mocks/vscode';
import { defaultSettings, insertText, labels, makeDoc, pos, rangeOf, token } from './helpers';

type Format = Record<string, any>;

const make = (overrides: Record<string, any> = {}, format: Format = {}) => {
	const base = defaultSettings(overrides);
	base.format = { ...base.format, ...format };
	return new Z80CompletionProvider(new SymbolProcessor(base));
};

const complete = async (provider: Z80CompletionProvider, line: string, extra = '') => {
	const doc = makeDoc(`${line}\n${extra}`);
	const result = await provider.provideCompletionItems(doc, pos(0, line.length), token);
	return result as vscode.CompletionItem[] | undefined;
};

const regsOnly = (items?: vscode.CompletionItem[]) =>
	labels(items).filter(l => !['foo'].includes(l));

describe('Z80CompletionProvider: instruction completion', () => {
	describe('mnemonic', () => {
		it('offers all Z80 and Z80N instructions', async () => {
			const items = (await complete(make(), '\tl'))!;
			assert.strictEqual(items.length, set.instructions.length + set.nextInstructions.length);
			assert.ok(labels(items).includes('ld'));
			assert.ok(labels(items).includes('ldirx'));
		});

		it('uses Keyword kind and marks Z80N instructions, sorting them last', async () => {
			const items = (await complete(make(), '\tl'))!;
			const ld = items.find(i => i.label === 'ld')!;
			const nreg = items.find(i => i.label === 'nextreg')!;

			assert.strictEqual(ld.kind, vscode.CompletionItemKind.Keyword);
			assert.strictEqual(ld.documentation, undefined);
			assert.strictEqual((nreg.documentation as any).value, '(Z80N)');
			assert.strictEqual(nreg.sortText, 'znextreg');
		});

		it('preselects the first instruction matching the typed prefix', async () => {
			const items = (await complete(make(), '\tcp'))!;
			assert.strictEqual(items.find(i => i.preselect)!.label, 'cp');
		});

		it('follows the case of typed text in `auto` mode', async () => {
			assert.ok(labels(await complete(make(), '\tLD')).includes('LD'));
			assert.ok(labels(await complete(make(), '\tld')).includes('ld'));
		});

		it('forces uppercase or lowercase if configured', async () => {
			assert.ok(labels(await complete(make({}, { uppercaseKeywords: true }), '\tld')).includes('LD'));
			assert.ok(labels(await complete(make({}, { uppercaseKeywords: false }), '\tLD')).includes('ld'));
		});

		it('replaces the typed fragment only', async () => {
			const items = (await complete(make(), 'label:\tld'))!;
			assert.deepStrictEqual(rangeOf(items[0]), [7, 9]);
		});

		it('works after a colon-separated instruction', async () => {
			const items = (await complete(make(), '\tnop : ld'))!;
			assert.deepStrictEqual(rangeOf(items[0]), [7, 9]);
		});

		it('offers code labels, but neither modules nor constants, in the place of instruction', async () => {
			const items = (await complete(make(), '\tfo', '\tmodule mod\n\tendmodule\nfoo\tnop\nCONST = 1'))!;
			assert.ok(labels(items).includes('foo'));
			assert.ok(!labels(items).includes('mod'));
			assert.ok(!labels(items).includes('CONST'));
		});

		it('is silent after comment starts or on a blank line', async () => {
			assert.strictEqual(await complete(make(), '\tnop ; ld'), undefined);
			assert.strictEqual(await complete(make(), '\t'), undefined);
			assert.strictEqual(await complete(make(), 'label:'), undefined);
		});

		it('triggers suggest manually when `suggestOnInstructions` is off', async () => {
			executedCommands.length = 0;
			await complete(make({ suggestOnInstructions: false }), '\tl');
			assert.deepStrictEqual(executedCommands, ['editor.action.triggerSuggest']);

			executedCommands.length = 0;
			await complete(make({ suggestOnInstructions: true }), '\tl');
			assert.deepStrictEqual(executedCommands, []);
		});

		describe('whitespace after instruction', () => {
			const ins = async (format: Format, settings: Record<string, any> = {}, mnemonic = '\tl') => {
				const items = (await complete(make(settings, format), mnemonic))!;
				return (name: string) => insertText(items.find(i => i.label === name)!);
			};

			it('appends single space or tab as configured', async () => {
				assert.strictEqual((await ins({ whitespaceAfterInstruction: 'single-space' }))('ld'), 'ld $0');
				assert.strictEqual((await ins({ whitespaceAfterInstruction: 'tab' }))('ld'), 'ld\t$0');
			});

			it('pads to the tabstop in `auto` mode with spaces indentation', async () => {
				const t = await ins({}, {}, '\tl');
				assert.strictEqual(t('ld'), 'ld\t$0', 'tab indentation');

				const mock = await import('./mocks/vscode');
				mock.workspaceConfig.editor.insertSpaces = true;
				try {
					const s = await ins({});
					assert.strictEqual(s('ld'), 'ld      $0');
					assert.strictEqual(s('nextreg'), 'nextreg $0');
				}
				finally {
					mock.workspaceConfig.editor.insertSpaces = false;
				}
			});

			it('no-operand instructions get a space or an EOL with `splitInstructionsByColon`', async () => {
				assert.strictEqual((await ins({}))('nop'), 'nop $0');
				assert.strictEqual((await ins({ splitInstructionsByColon: true }))('nop'), 'nop\n$0');
			});

			it('sets commit character to tab only when enabled', async () => {
				const on = (await complete(make({ suggestCommitWithCustomKeys: true }), '\tl'))!;
				assert.deepStrictEqual(on[0].commitCharacters, ['\t']);
				const off = (await complete(make(), '\tl'))!;
				assert.strictEqual(off[0].commitCharacters, undefined);
			});
		});
	});

	describe('first argument', () => {
		const first = (items?: vscode.CompletionItem[]) => labels(items).filter(l => !/^foo/.test(l));

		it('suggests 8-bit and 16-bit registers for LD, INC, DEC, ADD, ADC, SBC', async () => {
			for (const ins of ['ld', 'inc', 'dec', 'adc', 'add', 'sbc', 'ex']) {
				const names = first(await complete(make(), `\t${ins} `));
				assert.deepStrictEqual(names.slice(0, 3), ['a', 'b', 'c'], ins);
				assert.ok(names.includes('hl'), `${ins}: hl`);
				assert.ok(names.includes('(ix+*)'), `${ins}: (ix+*)`);
				assert.ok(names.includes('sp'), `${ins}: sp`);
			}
		});

		it('suggests only 8-bit operands for CP, AND, OR, XOR, SUB, shifts, MUL, TEST', async () => {
			for (const ins of ['cp', 'and', 'or', 'xor', 'sub', 'sla', 'sra', 'srl', 'sll', 'sl1', 'mul', 'test']) {
				const names = first(await complete(make(), `\t${ins} `));
				assert.ok(names.includes('a'), ins);
				assert.ok(names.includes('(hl)'), ins);
				assert.ok(!names.includes('hl'), `${ins} has no 16-bit`);
				assert.ok(!names.includes('af'), `${ins} has no 16-bit`);
			}
		});

		it('suggests only 16-bit register pairs for PUSH and POP', async () => {
			for (const ins of ['push', 'pop']) {
				assert.deepStrictEqual(
					first(await complete(make(), `\t${ins} `)),
					['hl', 'de', 'bc', 'af', 'ix', 'iy']
				);
			}
		});

		it('suggests condition codes for JP, JR, CALL and RET', async () => {
			for (const ins of ['jp', 'jr', 'call', 'ret']) {
				assert.deepStrictEqual(
					first(await complete(make(), `\t${ins} `)),
					set.conditionals,
					ins
				);
			}
		});

		it('does not suggest registers for instructions without register operand', async () => {
			assert.deepStrictEqual(first(await complete(make(), '\tdjnz ')), []);
			assert.deepStrictEqual(first(await complete(make(), '\tim ')), []);
		});

		it('sets the replacement range to the already typed argument', async () => {
			const items = (await complete(make(), '\tpop h'))!;
			assert.deepStrictEqual(rangeOf(items[0]), [5, 6]);
		});

		it('respects case of the instruction', async () => {
			assert.deepStrictEqual(first(await complete(make(), '\tPUSH ')).slice(0, 2), ['HL', 'DE']);
			assert.deepStrictEqual(first(await complete(make({}, { uppercaseKeywords: true }), '\tpush ')).slice(0, 2), ['HL', 'DE']);
		});

		it('converts brackets to square when configured', async () => {
			const items = (await complete(make({}, { bracketType: 'square' }), '\tld '))!;
			assert.ok(labels(items).includes('[hl]'));
			assert.ok(labels(items).includes('[ix+*]'));
			assert.ok(!labels(items).includes('(hl)'));
		});

		it('puts registers on top by index-based sorting and provides tabstop for displacement', async () => {
			const items = (await complete(make(), '\tld '))!;
			const ix = items.find(i => i.label === '(ix+*)')!;
			assert.strictEqual(ix.sortText, '!0C');
			assert.strictEqual(insertText(ix), '(ix+${1:0})$0');
			assert.strictEqual(items.find(i => i.label === 'a')!.sortText, '!00');
		});

		it('commits with comma (and Tab/Enter) when custom keys enabled', async () => {
			const items = (await complete(make({ suggestCommitWithCustomKeys: true }), '\tld '))!;
			assert.deepStrictEqual(items[0].commitCharacters, [',', '\t', '\n']);
		});

		it('suggests labels together with registers', async () => {
			const items = await complete(make(), '\tld ', 'foo\tnop');
			assert.ok(labels(items).includes('foo'));
			assert.ok(labels(items).includes('a'));
		});
	});

	describe('second argument', () => {
		it('suggests all registers after the comma', async () => {
			for (const line of ['\tld a,', '\tld a, ', '\tadd hl,', '\tld (hl),', '\tbit 1,', '\tout (c),', '\tnextreg 1,', '\tbsla de,']) {
				const names = regsOnly(await complete(make(), line));
				assert.deepStrictEqual(names, set.registers, line);
			}
		});

		it('works for the later part of a colon-separated line', async () => {
			assert.strictEqual(labels(await complete(make(), '\tld a,b : ld c,')).length, set.registers.length);
		});

		it('suggests only `af\'` for `ex af,`', async () => {
			const items = (await complete(make(), '\tex af,'))!;
			assert.deepStrictEqual(labels(items), ["af'"]);
			assert.strictEqual(insertText(items[0]), "af'\n$0");
			assert.deepStrictEqual(labels(await complete(make(), '\tEX AF, ')), ["AF'"]);
		});

		it('suggests other registers for `ex de,`', async () => {
			assert.strictEqual(regsOnly(await complete(make(), '\tex de,')).length, set.registers.length);
		});

		it('prepends space after comma when `spaceAfterArgument` set', async () => {
			const items = (await complete(make({}, { spaceAfterArgument: true }), '\tld a,'))!;
			assert.strictEqual(insertText(items[0]), ' a$0');
		});

		it('skips the prefix space and trailing EOL when `formatOnType` active', async () => {
			const mock = await import('./mocks/vscode');
			mock.workspaceConfig.editor.formatOnType = true;
			try {
				const items = (await complete(make({}, { spaceAfterArgument: true, splitInstructionsByColon: true }), '\tld a,'))!;
				assert.strictEqual(insertText(items[0]), 'a$0');
			}
			finally {
				mock.workspaceConfig.editor.formatOnType = false;
			}
		});

		it('appends EOL after argument with `splitInstructionsByColon`', async () => {
			const items = (await complete(make({}, { splitInstructionsByColon: true }), '\tld a,'))!;
			assert.strictEqual(insertText(items[0]), 'a\n$0');
		});

		it('does not accept comma as commit character', async () => {
			const items = (await complete(make({ suggestCommitWithCustomKeys: true }), '\tld a,'))!;
			assert.deepStrictEqual(items[0].commitCharacters, ['\t', '\n']);
		});

		it('suggests labels in second argument too', async () => {
			assert.ok(labels(await complete(make(), '\tld hl,', 'foo\tnop')).includes('foo'));
		});

		it('offers conditions again after comma-free `jp`, but not after `jp nz,`', async () => {
			const items = await complete(make(), '\tjp nz,', 'foo\tnop');
			assert.ok(!labels(items).includes('nz'));
			assert.ok(labels(items).includes('foo'));
		});
	});
});
