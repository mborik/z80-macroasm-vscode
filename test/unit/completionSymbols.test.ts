import * as assert from 'assert';
import * as vscode from 'vscode';
import { Z80CompletionProvider } from '../../src/completionProvider';
import { SymbolProcessor } from '../../src/symbolProcessor';
import {
	defaultSettings, labels, lineOf, makeDoc, openFixture, pos, rangeOf, token
} from './helpers';

const complete = (provider: Z80CompletionProvider, doc: vscode.TextDocument, line: number, ch: number) =>
	provider.provideCompletionItems(doc, pos(line, ch), token) as Promise<vscode.CompletionItem[]>;

const docText = (item?: vscode.CompletionItem) => (item?.documentation as any)?.value as string | undefined;

describe('Z80CompletionProvider: suggestion of documented symbols', () => {
	let provider: Z80CompletionProvider;
	beforeEach(() => {
		provider = new Z80CompletionProvider(new SymbolProcessor(defaultSettings()));
	});

	it('suggests labels with documentation while typing an argument', async () => {
		const doc = await openFixture('unzx0v1_fast.asm');
		const line = lineOf(doc, 'ld ix,CopyMatch1');
		const items = await complete(provider, doc, line, doc.lineAt(line).text.indexOf('CopyMatch1') + 4);

		const item = items.find(i => i.label === 'CopyMatch1');
		assert.ok(item);
		assert.strictEqual(item!.kind, vscode.CompletionItemKind.Function);
		assert.strictEqual(docText(item), 'the faster match copying code');
	});

	it('shows constants from an included file with their values', async () => {
		const doc = await openFixture('loader.a80');
		const line = lineOf(doc, 'db\tC_CLEAR');
		const items = await complete(provider, doc, line, doc.lineAt(line).text.length);

		assert.strictEqual(docText(items.find(i => i.label === 'C_CLEAR')), '`#FD`');
		assert.strictEqual(docText(items.find(i => i.label === 'EOL')), '`#0D`');
	});

	it('suggests module-prefixed names with the declaration as the first documentation line', async () => {
		const doc = await openFixture('loader.a80');
		const line = lineOf(doc, 'dw\tline1.len');
		const items = await complete(provider, doc, line, doc.lineAt(line).text.length);

		assert.ok(labels(items).includes('bas.line1.len'));
		assert.ok(docText(items.find(i => i.label === 'bas.line1.len'))!.startsWith('bas.line1.len\n\n`$ - line1.cmds`'));
		assert.ok(labels(items).includes('line1.len'));
	});

	it('documents MACRO with multiple arguments in the suggestion list', async () => {
		const doc = await openFixture('loader.a80');
		const line = lineOf(doc, 'save3dos');
		const items = await complete(provider, doc, line, doc.lineAt(line).text.length);

		assert.strictEqual(docText(items.find(i => i.label === 'VAL')), '**macro VAL**\n`number?, appendix?`');
	});

	it('documents macro with a long comment header from unzx0v1_fast.asm', async () => {
		const doc = await openFixture('unzx0v1_fast.asm');
		const line = lineOf(doc, 'ld ix,CopyMatch1');
		const items = await complete(provider, doc, line, doc.lineAt(line).text.indexOf('CopyMatch1') + 4);

		assert.ok(docText(items.find(i => i.label === 'RELOAD_BITS'))!.startsWith('**macro RELOAD_BITS**'));
		assert.strictEqual(docText(items.find(i => i.label === 'INLINE_READ_GAMMA')), '**macro INLINE_READ_GAMMA**');
	});

	it('marks symbol kinds with appropriate icons', async () => {
		const doc = await openFixture('loader.a80');
		const line = lineOf(doc, 'save3dos');
		const items = await complete(provider, doc, line, doc.lineAt(line).text.length);
		const kind = (n: string) => items.find(i => i.label === n)?.kind;

		assert.strictEqual(kind('bas'), vscode.CompletionItemKind.Module);
		assert.strictEqual(kind('start'), vscode.CompletionItemKind.Function);
		assert.strictEqual(kind('C_CLEAR'), vscode.CompletionItemKind.Variable);
	});

	it('sorts symbols of the current file by distance from the cursor', async () => {
		const doc = makeDoc('a1\tnop\nb1\tnop\nc1\tnop\n\tjp ');
		const items = await complete(provider, doc, 3, 4);
		const sort = (n: string) => items.find(i => i.label === n)!.sortText!;

		assert.ok(sort('c1') < sort('b1'));
		assert.ok(sort('b1') < sort('a1'));
	});

	it('replaces only the part after a dot when completing a local label', async () => {
		const doc = makeDoc('main\tnop\n.loop\tnop\n\tjr main.lo');
		const items = await complete(provider, doc, 2, 11);
		const item = items.find(i => i.label === '.loop');

		assert.ok(item);
		assert.deepStrictEqual(rangeOf(item!), [8, 11]);
	});

	it('uses custom commit characters only when enabled', async () => {
		const doc = makeDoc('lbl\tnop\n\tjp lb');
		let items = await complete(provider, doc, 1, 6);
		assert.strictEqual(items.find(i => i.label === 'lbl')!.commitCharacters, undefined);

		provider = new Z80CompletionProvider(new SymbolProcessor(defaultSettings({ suggestCommitWithCustomKeys: true })));
		items = await complete(provider, doc, 1, 6);
		assert.deepStrictEqual(items.find(i => i.label === 'lbl')!.commitCharacters, ['\n']);
	});

	it('suggests nothing in a comment or an empty line', async () => {
		const doc = makeDoc('lbl\tnop\n\tld a,b ; lb\n   ');
		assert.strictEqual(await complete(provider, doc, 1, 12), undefined);
		assert.strictEqual(await complete(provider, doc, 2, 3), undefined);
	});

	it('suggests symbols of other files only with `seekSymbolsThroughWorkspace`', async () => {
		const other = makeDoc('foreign\tnop', '/virtual/ws/other.a80');
		const doc = makeDoc('\tjp ', '/virtual/ws/main.a80');

		const processor = new SymbolProcessor(defaultSettings({ seekSymbolsThroughWorkspace: true }));
		await processor.symbols(other);
		const wide = new Z80CompletionProvider(processor);

		assert.ok(labels(await complete(wide, doc, 0, 4)).includes('foreign'));
		assert.ok(!labels(await complete(provider, doc, 0, 4)).includes('foreign'));
	});
});
