import * as path from 'path';
import * as vscode from 'vscode';
import { Z80CompletionProvider } from '../../src/completionProvider';
import { SymbolProcessor } from '../../src/symbolProcessor';
import * as mock from './mocks/vscode';

export const FIXTURES = path.resolve(__dirname, '../../../test/fixtures');
export const fixture = (name: string) => path.join(FIXTURES, name);

export const defaultSettings = (overrides: Record<string, any> = {}): any => ({
	files: { include: '**/*.{a80,asm,inc,s}', exclude: null },
	seekSymbolsThroughWorkspace: false,
	suggestOnInstructions: true,
	suggestCommitWithCustomKeys: false,
	format: {
		whitespaceAfterInstruction: 'auto',
		spaceAfterArgument: false,
		splitInstructionsByColon: false,
		uppercaseKeywords: 'auto',
		bracketType: 'no-change',
	},
	...overrides,
});

export const token: vscode.CancellationToken = {
	isCancellationRequested: false,
	onCancellationRequested: (() => ({ dispose() { /* nothing */ } })) as any
};

/** Creates an in-memory document that is visible to the SymbolProcessor. */
export const makeDoc = (text: string, fsPath = '/virtual/test.a80') =>
	mock.registerDocument(new mock.TextDocument(fsPath, text)) as unknown as vscode.TextDocument;

export const openFixture = async (name: string) =>
	(await mock.workspace.openTextDocument(fixture(name))) as unknown as vscode.TextDocument;

/** Creates a processor and indexes `doc` (and its includes) by requesting its symbols. */
export const makeProcessor = async (doc: vscode.TextDocument, settings = defaultSettings()) => {
	const processor = new SymbolProcessor(settings);
	await processor.symbols(doc);
	return processor;
};

export const makeCompletion = (settings = defaultSettings()) =>
	new Z80CompletionProvider(new SymbolProcessor(settings));

export const pos = (line: number, character: number) => new mock.Position(line, character) as unknown as vscode.Position;

/** Position at the end of line `line` or, with `marker`, right after its first occurrence. */
export const posAfter = (doc: vscode.TextDocument, line: number, marker?: string) => {
	const text = doc.lineAt(line).text;
	const ch = marker === undefined ? text.length : text.indexOf(marker) + marker.length;
	return pos(line, ch);
};

export const hoverText = (h: any): string => (h?.contents?.value ?? h?.contents ?? '');

export const labels = (items: vscode.CompletionItem[] | undefined) => (items || []).map(i => i.label.toString());

export const insertText = (item: vscode.CompletionItem) =>
	(typeof item.insertText === 'string' ? item.insertText : (item.insertText as any)?.value) as string;

/** Position inside the first line containing `needle` (offset `inner` characters after its start). */
export const posOf = (doc: vscode.TextDocument, needle: string, inner = 1, fromLine = 0) => {
	for (let i = fromLine; i < doc.lineCount; i++) {
		const ch = doc.lineAt(i).text.indexOf(needle);
		if (ch >= 0) {
			return pos(i, ch + inner);
		}
	}
	throw new Error(`"${needle}" not found in ${doc.fileName}`);
};

export const lineOf = (doc: vscode.TextDocument, needle: string) => posOf(doc, needle).line;

export const rangeOf = (item: vscode.CompletionItem) => {
	const r = item.range as vscode.Range;
	return [r.start.character, r.end.character];
};
