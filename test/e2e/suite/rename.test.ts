import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const FIXTURES = path.resolve(__dirname, '../../../../test/fixtures');

const openFixture = async (name: string) => {
	const doc = await vscode.workspace.openTextDocument(path.join(FIXTURES, name));
	await vscode.window.showTextDocument(doc);
	assert.strictEqual(doc.languageId, 'z80-macroasm');
	return doc;
};

const positionOf = (doc: vscode.TextDocument, needle: string, inner = 1) => {
	for (let i = 0; i < doc.lineCount; i++) {
		const ch = doc.lineAt(i).text.indexOf(needle);
		if (ch >= 0) {
			return new vscode.Position(i, ch + inner);
		}
	}
	throw new Error(`"${needle}" not found in ${doc.fileName}`);
};

/** Asks the extension's rename provider for edits through the public VS Code command. */
const provideRename = async (doc: vscode.TextDocument, position: vscode.Position, newName: string) => {
	// the symbol index is filled asynchronously after activation
	let edit: vscode.WorkspaceEdit | undefined;
	for (let attempt = 0; attempt < 20; attempt++) {
		edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
			'vscode.executeDocumentRenameProvider', doc.uri, position, newName
		);
		if (edit && edit.size) {
			break;
		}
		await new Promise(r => setTimeout(r, 250));
	}
	assert.ok(edit, 'rename provider returned no edit');
	return edit!;
};

/** Text of every touched file after applying `edit`, without touching the disk. */
const applyToText = async (edit: vscode.WorkspaceEdit) => {
	const result = new Map<string, string>();
	for (const [uri, edits] of edit.entries()) {
		const doc = await vscode.workspace.openTextDocument(uri);
		const lines = doc.getText().split(/\r?\n/);

		[...edits]
			.sort((a, b) => b.range.start.line - a.range.start.line || b.range.start.character - a.range.start.character)
			.forEach(e => {
				const l = lines[e.range.start.line];
				lines[e.range.start.line] = l.slice(0, e.range.start.character) + e.newText + l.slice(e.range.end.character);
			});

		result.set(path.basename(uri.fsPath), lines.join('\n'));
	}
	return result;
};

describe('E2E: rename provider', () => {
	before(async function () {
		this.timeout(60000);
		await openFixture('loader.a80');
	});

	afterEach(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

	it('renames a label with its nested labels on every line of the file', async () => {
		const doc = await openFixture('loader.a80');
		const edit = await provideRename(doc, positionOf(doc, 'line1:'), 'renamed');
		const texts = await applyToText(edit);
		const text = texts.get('loader.a80')!;

		assert.deepStrictEqual([...texts.keys()], ['loader.a80']);
		assert.ok(text.includes('renamed:\t\tdb\t0, 1'), 'definition');
		assert.ok(text.includes('dw\trenamed.len'), 'nested reference');
		assert.ok(text.includes('renamed.cmds\t; CLEAR VAL "x":'), 'nested definition');
		assert.ok(text.includes('renamed.len = $ - renamed.cmds'), 'nested definition and expression');
		assert.ok(!/\bline1\b/.test(text), 'no leftovers');
		assert.ok(text.includes('module bas'), 'module untouched');
		assert.ok(text.includes('"NOTER.COD"'), 'strings untouched');
	});

	it('renames from a reference exactly like from the definition', async () => {
		const doc = await openFixture('loader.a80');
		const fromDef = await applyToText(await provideRename(doc, positionOf(doc, 'line1:'), 'renamed'));
		const fromRef = await applyToText(await provideRename(doc, positionOf(doc, 'dw\tline1.len', 5), 'renamed'));

		assert.strictEqual(fromRef.get('loader.a80'), fromDef.get('loader.a80'));
	});

	it('renames a constant from the included file in both files', async () => {
		const doc = await openFixture('loader.a80');
		const edit = await provideRename(doc, positionOf(doc, 'C_RANDOMIZE'), 'C_RAND');
		const texts = await applyToText(edit);

		assert.deepStrictEqual([...texts.keys()].sort(), ['loader.a80', 'sinclairBASIC.inc']);
		assert.ok(texts.get('loader.a80')!.includes('db\tC_RAND, C_USR'));
		assert.ok(texts.get('sinclairBASIC.inc')!.includes('C_RAND\t\t= #F9'));
		assert.ok(!/C_RANDOMIZE/.test(texts.get('loader.a80')!.replace(/; RANDOMIZE USR VAL "x"/, '')));
		assert.ok(texts.get('loader.a80')!.includes('; RANDOMIZE USR VAL "x"'), 'comment untouched');
		assert.ok(!texts.get('sinclairBASIC.inc')!.includes('C_RANDOMIZE'));
	});

	it('renames when the cursor is inside the included file', async () => {
		await openFixture('loader.a80');
		const inc = await openFixture('backend/sinclairBASIC.inc');
		const edit = await provideRename(inc, positionOf(inc, 'C_RANDOMIZE'), 'C_RAND');
		const texts = await applyToText(edit);

		assert.ok(texts.has('loader.a80'));
		assert.ok(texts.has('sinclairBASIC.inc'));
	});

	it('rejects renaming of comments, strings, numbers, keywords and includes', async () => {
		const doc = await openFixture('loader.a80');
		const prepare = (needle: string, inner: number) => Promise.resolve(
			vscode.commands.executeCommand('vscode.executeDocumentRenameProvider', doc.uri, positionOf(doc, needle, inner), 'x'));

		for (const [needle, inner] of [['RANDOMIZE USR VAL', 3], ['NOTER.COD', 3], ['"backend', 3], ['device', 2], ['23755', 2]] as const) {
			await assert.rejects(prepare(needle, inner), `${needle} must not be renamable`);
		}
	});
});
