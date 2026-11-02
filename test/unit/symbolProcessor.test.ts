import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProcessorResult } from '../../src/symbolProcessor';
import { fixture, lineOf, makeDoc, makeProcessor, openFixture, pos, posOf, token } from './helpers';

describe('SymbolProcessor: parsing of source code', () => {
	describe('labels, comments and documentation', () => {
		const src = [
			';--------------',
			'; Documented routine',
			'; second line',
			'routine:\tld a,b',
			'.local\tret\t; trailing note',
			'\t\t12:',
			'plain\tnop',
			'$$temp\tnop',
			'; before const',
			'CONST\t= #FF',
			'screen\tincbin "data.bin"',
			'text\tdb\t"hello", 0',
		].join('\n');

		it('indexes labels with their documentation comments', async () => {
			const doc = makeDoc(src);
			const symbols = await (await makeProcessor(doc)).symbols(doc);

			assert.strictEqual(symbols['routine'].documentation, 'Documented routine\nsecond line');
			assert.strictEqual(symbols['routine'].line, 3);
			assert.strictEqual(symbols['routine'].kind, vscode.SymbolKind.Function);
			assert.strictEqual(symbols['plain'].documentation, undefined);
		});

		it('ignores horizontal rules in comment blocks', async () => {
			const doc = makeDoc(src);
			const symbols = await (await makeProcessor(doc)).symbols(doc);
			assert.ok(!symbols['routine'].documentation!.includes('---'));
		});

		it('resolves local labels under their parent label', async () => {
			const doc = makeDoc(src);
			const symbols = await (await makeProcessor(doc)).symbols(doc);

			const local = symbols['routine.local'];
			assert.ok(local, 'routine.local should be indexed');
			assert.strictEqual(local.localLabel, true);
			assert.strictEqual(local.declaration, 'routine.local');
			assert.strictEqual(symbols['.local'], local);
			assert.strictEqual(local.documentation, 'trailing note');
		});

		it('does not treat numeric temporary labels as symbols', async () => {
			const doc = makeDoc(src);
			const symbols = await (await makeProcessor(doc)).symbols(doc);
			assert.ok(!('12' in symbols));
		});

		it('does not make `$$` labels a parent of local labels', async () => {
			const doc = makeDoc('main\tnop\n$$tmp\tnop\n.sub\tnop');
			const symbols = await (await makeProcessor(doc)).symbols(doc);
			assert.ok(symbols['main.sub'], '.sub belongs to `main`');
			assert.ok(symbols['$$tmp']);
		});

		it('classifies constants and file definitions and documents their values', async () => {
			const doc = makeDoc(src);
			const symbols = await (await makeProcessor(doc)).symbols(doc);

			assert.strictEqual(symbols['CONST'].kind, vscode.SymbolKind.Constant);
			assert.strictEqual(symbols['CONST'].documentation, 'before const\n\n`#FF`');
			assert.strictEqual(symbols['screen'].kind, vscode.SymbolKind.File);
			assert.ok(symbols['screen'].documentation!.includes('incbin  "data.bin"'));
			assert.strictEqual(symbols['text'].kind, vscode.SymbolKind.Variable);
		});
	});

	describe('modules', () => {
		const src = [
			'; the module',
			'\tmodule gfx',
			'draw\tret',
			'.inner\tret',
			'@global\tret',
			'\tendmodule',
			'after\tret',
		].join('\n');

		it('prefixes labels inside module with its name and documents the module', async () => {
			const doc = makeDoc(src);
			const symbols = await (await makeProcessor(doc)).symbols(doc);

			assert.strictEqual(symbols['gfx'].kind, vscode.SymbolKind.Module);
			assert.strictEqual(symbols['gfx'].documentation, '**module gfx**\n\nthe module');
			assert.strictEqual(symbols['gfx.draw'].declaration, 'gfx.draw');
			assert.strictEqual(symbols['draw'], symbols['gfx.draw']);
			assert.ok(symbols['gfx.draw.inner']);
		});

		it('keeps `@`-prefixed labels global and resets scope after endmodule', async () => {
			const doc = makeDoc(src);
			const symbols = await (await makeProcessor(doc)).symbols(doc);

			assert.strictEqual(symbols['global'].declaration, 'global');
			assert.strictEqual(symbols['after'].declaration, 'after');
		});
	});

	describe('includes', () => {
		it('follows `include` directives and exposes symbols of included files', async () => {
			const doc = await openFixture('loader.a80');
			const processor = await makeProcessor(doc);
			const symbols = await processor.symbols(doc);

			assert.ok(symbols['EOL'], 'EOL from backend/sinclairBASIC.inc');
			assert.ok(symbols['C_CLEAR']);
			assert.ok(symbols['VAL']);

			const files = Object.keys(processor.filesWithIncludes(doc));
			assert.deepStrictEqual(files, [
				fixture('loader.a80'),
				fixture(path.join('backend', 'sinclairBASIC.inc')),
			]);
		});

		it('survives missing and circular includes', async () => {
			const a = makeDoc('\tinclude "b.a80"\nfromA\tnop', '/virtual/a.a80');
			makeDoc('\tinclude "a.a80"\n\tinclude "missing.a80"\nfromB\tnop', '/virtual/b.a80');

			const symbols = await (await makeProcessor(a)).symbols(a);
			assert.ok(symbols['fromA']);
			assert.ok(symbols['fromB']);
		});

		it('applies include-site module/label path to included symbols', async () => {
			makeDoc('inner\tnop', '/virtual/mod/inc.a80');
			const doc = makeDoc('\tmodule outer\n\tinclude "inc.a80"\n\tendmodule', '/virtual/mod/main.a80');

			const symbols = await (await makeProcessor(doc)).symbols(doc);
			assert.ok(symbols['outer.inner']);
		});
	});

	describe('macros', () => {
		it('indexes MACRO with multiple arguments and documents its signature', async () => {
			const doc = await openFixture('loader.a80');
			const symbols = await (await makeProcessor(doc)).symbols(doc);

			const macro = symbols['VAL'];
			assert.strictEqual(macro.kind, vscode.SymbolKind.Event);
			assert.strictEqual(macro.documentation, '**macro VAL**\n`number?, appendix?`');
			assert.ok(macro.location.uri.fsPath.endsWith('sinclairBASIC.inc'));
			assert.strictEqual(macro.line, 0);
		});

		it('indexes locals defined inside macro body', async () => {
			const doc = await openFixture('loader.a80');
			const symbols = await (await makeProcessor(doc)).symbols(doc);
			assert.strictEqual(symbols['__VAL_number'].documentation, '`number?`');
			assert.strictEqual(symbols['__VAL_appendix'].documentation, '`appendix?`');
		});

		it('documents macro without arguments with preceding and trailing comments', async () => {
			const doc = makeDoc('; fetch byte\n\tmacro FETCH ; inline\n\tld a,(hl)\n\tendm');
			const symbols = await (await makeProcessor(doc)).symbols(doc);
			assert.strictEqual(symbols['FETCH'].documentation, '**macro FETCH**\ninline\nfetch byte');
		});

		it('indexes macros of unzx0v1_fast.asm incl. long license header as docs', async () => {
			const doc = await openFixture('unzx0v1_fast.asm');
			const symbols = await (await makeProcessor(doc)).symbols(doc);

			assert.ok(symbols['RELOAD_BITS'].documentation!.startsWith('**macro RELOAD_BITS**'));
			assert.ok(symbols['RELOAD_BITS'].documentation!.includes('Speed-optimized ZX0v1 decompressor'));
			assert.strictEqual(symbols['INLINE_READ_GAMMA'].documentation, '**macro INLINE_READ_GAMMA**');
			assert.ok(symbols['.ReadGammaBits'], 'local label defined inside macro');
		});
	});

	describe('real-world fixtures', () => {
		it('loader.a80: module `bas` and its dotted labels', async () => {
			const doc = await openFixture('loader.a80');
			const symbols = await (await makeProcessor(doc)).symbols(doc);

			assert.strictEqual(symbols['bas'].kind, vscode.SymbolKind.Module);
			assert.strictEqual(symbols['bas.line1'].line, lineOf(doc, 'line1:'));
			assert.strictEqual(symbols['bas.line1.cmds'].documentation, 'CLEAR VAL "x":');
			assert.strictEqual(symbols['bas.line1.len'].kind, vscode.SymbolKind.Constant);
			assert.strictEqual(symbols['bas.line1.len'].documentation, '`$ - line1.cmds`');
			assert.strictEqual(symbols['start'].declaration, 'start');
			assert.strictEqual(symbols['total'].documentation, '`$ - start`');
		});

		it('sinclairBASIC.inc: constants documented by value', async () => {
			const doc = await openFixture('loader.a80');
			const symbols = await (await makeProcessor(doc)).symbols(doc);
			assert.strictEqual(symbols['C_CLEAR'].documentation, '`#FD`');
			assert.strictEqual(symbols['EOL'].kind, vscode.SymbolKind.Constant);
		});

		it('unzx0v1_fast.asm: comments after label become docs', async () => {
			const doc = await openFixture('unzx0v1_fast.asm');
			const symbols = await (await makeProcessor(doc)).symbols(doc);

			assert.strictEqual(symbols['DecompressZX0v1'].documentation, "AF' must have flag C switched on");
			assert.strictEqual(symbols['CopyMatch2'].documentation, 'the case of matches with len=2');
			assert.strictEqual(symbols['ProcessOffset'].documentation, undefined);
			assert.ok(symbols['AfterMatch1'].documentation!.includes('another match'));
			assert.ok(symbols['PrevOffset'].documentation!.includes('restore offset'));
		});
	});

	describe('provideSymbols', () => {
		it('lists unique declarations filtered by query', async () => {
			const doc = await openFixture('loader.a80');
			const processor = await makeProcessor(doc);
			const result = await processor.provideSymbols(doc.fileName, 'line1', token);

			const names = result.map(s => s.name).sort();
			assert.deepStrictEqual(names, ['bas.line1', 'bas.line1.cmds', 'bas.line1.len']);
		});
	});

	describe('getFullSymbolAtDocPosition', () => {
		it('returns symbol definition location', async () => {
			const doc = await openFixture('loader.a80');
			const processor = await makeProcessor(doc);
			const location: any = await processor.getFullSymbolAtDocPosition(
				doc, posOf(doc, 'C_CLEAR'), token, ProcessorResult.DEFINITION
			);

			assert.ok(location.uri.fsPath.endsWith('sinclairBASIC.inc'));
			assert.strictEqual(location.range.start.line, lineOf(await openFixture('backend/sinclairBASIC.inc'), 'C_CLEAR'));
		});

		it('returns nothing for comments, numbers, strings and unknown words', async () => {
			const doc = makeDoc('known\tnop\n\tld a,known ; known\n\tld a,$10\n\tdb "known"\n\tld a,unknown');
			const processor = await makeProcessor(doc);
			const at = (line: number, ch: number) =>
				processor.getFullSymbolAtDocPosition(doc, pos(line, ch), token, ProcessorResult.DEFINITION);

			assert.ok(await at(1, 7), 'sanity: label in code resolves');
			assert.strictEqual(await at(1, 16), undefined, 'comment');
			assert.strictEqual(await at(2, 8), undefined, 'number');
			assert.strictEqual(await at(3, 6), undefined, 'string');
			assert.strictEqual(await at(4, 8), undefined, 'unknown symbol');
		});

		it('resolves local label relative to the nearest parent label', async () => {
			const doc = await openFixture('unzx0v1_fast.asm');
			const processor = await makeProcessor(doc);
			const symbol: any = await processor.getFullSymbolAtDocPosition(
				doc, posOf(doc, '.ReadGammaBits\t\tadd', 2), token, ProcessorResult.SYMBOL_FULL
			);
			assert.strictEqual(symbol.labelPart, '.ReadGammaBits');
		});
	});
});
