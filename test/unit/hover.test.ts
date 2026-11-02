import * as assert from 'assert';
import { Z80HoverProvider } from '../../src/hover';
import { fixture, hoverText, makeDoc, makeProcessor, openFixture, pos, posOf, token } from './helpers';

describe('Z80HoverProvider', () => {
	const hover = async (name: string, needle: string, inner = 1) => {
		const doc = await openFixture(name);
		const provider = new Z80HoverProvider(await makeProcessor(doc));
		return provider.provideHover(doc, posOf(doc, needle, inner), token) as Promise<any>;
	};

	it('shows documentation of a label defined with a comment block', async () => {
		const h = await hover('unzx0v1_fast.asm', 'ld ix,CopyMatch1', 8);
		assert.strictEqual(hoverText(h), 'the faster match copying code');
	});

	it('shows documentation of a label declared by the trailing comment', async () => {
		const doc = makeDoc('\tcall routine\nroutine\tret\t; does it');
		const provider = new Z80HoverProvider(await makeProcessor(doc));
		const h: any = await provider.provideHover(doc, pos(0, 8), token);
		assert.strictEqual(hoverText(h), 'does it');
		assert.deepStrictEqual([h.range.start.character, h.range.end.character], [6, 13]);
	});

	it('shows constant value from an included file', async () => {
		assert.strictEqual(hoverText(await hover('loader.a80', 'C_CLEAR')), '`#FD`');
	});

	it('shows expression of evaluated labels', async () => {
		assert.strictEqual(hoverText(await hover('loader.a80', 'dw\tline1.len', 5)), '`$ - line1.cmds`');
	});

	it('shows documentation of the label at its definition', async () => {
		assert.strictEqual(hoverText(await hover('loader.a80', 'line1:')), '```\ndb      0, 1\n```');
	});

	it('resolves local label to its parent', async () => {
		const h = await hover('unzx0v1_fast.asm', 'jr nc,.ReadGammaBits', 8);
		assert.ok(h, 'local label hover');
		assert.strictEqual(h.range.end.character - h.range.start.character, '.ReadGammaBits'.length);
	});

	it('shows macro signature and documentation when hovering a macro call', async () => {
		const text = hoverText(await hover('loader.a80', 'VAL\t$6000 - 1', 1));
		assert.strictEqual(text, '**macro VAL**\n`number?, appendix?`');
	});

	it('shows the path of the included file', async () => {
		const h = await hover('loader.a80', '"backend/sinclairBASIC.inc"', 3);
		assert.strictEqual(hoverText(h), fixture('backend/sinclairBASIC.inc'));
	});

	it('shows nothing for instructions, registers and keywords', async () => {
		assert.strictEqual(await hover('unzx0v1_fast.asm', 'ld ix,CopyMatch1', 1), undefined, 'instruction');
		assert.strictEqual(await hover('unzx0v1_fast.asm', 'ld ix,CopyMatch1', 5), undefined, 'register');
		assert.strictEqual(await hover('loader.a80', 'device', 2), undefined, 'directive');
		assert.strictEqual(await hover('loader.a80', 'db\tC_CLEAR', 1), undefined, 'data directive');
	});

	it('shows nothing inside comments, strings and numbers', async () => {
		assert.strictEqual(await hover('loader.a80', 'RANDOMIZE USR VAL', 4), undefined, 'comment');
		assert.strictEqual(await hover('loader.a80', 'NOTER.COD', 2), undefined, 'string');
		assert.strictEqual(await hover('loader.a80', '$6000 - 1', 2), undefined, 'number');
	});

	it('shows nothing for undefined symbols', async () => {
		const doc = makeDoc('\tjp nowhere');
		const provider = new Z80HoverProvider(await makeProcessor(doc));
		assert.strictEqual(await provider.provideHover(doc, pos(0, 7), token), undefined);
	});
});
