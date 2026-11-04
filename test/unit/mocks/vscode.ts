/**
 * Minimal in-memory implementation of the parts of the `vscode` API used by
 * the extension, so providers can be unit-tested in plain Node.js (no Extension Host).
 */
import * as fs from 'fs';
import * as path from 'path';

export class Position {
	constructor(public line: number, public character: number) {}
}

export class Range {
	start: Position;
	end: Position;

	constructor(a: number | Position, b: number | Position, c?: number, d?: number) {
		if (typeof a === 'number') {
			this.start = new Position(a, b as number);
			this.end = new Position(c as number, d as number);
		}
		else {
			this.start = a;
			this.end = b as Position;
		}
	}

	get isEmpty() {
		return this.start.line === this.end.line && this.start.character === this.end.character;
	}

	get isSingleLine() {
		return this.start.line === this.end.line;
	}
}

export class Uri {
	private constructor(public fsPath: string) {}
	static file(p: string) { return new Uri(path.resolve(p)); }
	toString() { return `file://${this.fsPath}`; }
}

export class Location {
	range: Range;

	constructor(public uri: Uri, range: Range | Position) {
		this.range = range instanceof Position ? new Range(range, range) : range;
	}
}

export class MarkdownString {
	constructor(public value: string = '') {}
	appendMarkdown(v: string) { this.value += v; return this; }
}

export class SnippetString {
	constructor(public value: string = '') {}
	appendText(s: string) { this.value += s.replace(/[\\$}]/g, '\\$&'); return this; }
	appendTabstop(n: number) { this.value += `$${n}`; return this; }
}

export class CompletionItem {
	insertText?: string | SnippetString;
	sortText?: string;
	documentation?: string | MarkdownString;
	commitCharacters?: string[];
	preselect?: boolean;
	range?: Range;
	constructor(public label: string, public kind?: number) {}
}

export class Hover {
	constructor(public contents: MarkdownString | string, public range?: Range) {}
}

export class SymbolInformation {
	constructor(public name: string, public kind: number, public containerName: string, public location: Location) {}
}

export class WorkspaceEdit {
	private edits: { uri: Uri, range: Range, newText: string }[] = [];
	replace(uri: Uri, range: Range, newText: string) { this.edits.push({ uri, range, newText }); }
	get size() { return new Set(this.edits.map(e => e.uri.fsPath)).size; }
	entries(): [Uri, { range: Range, newText: string }[]][] {
		const map = new Map<string, [Uri, { range: Range, newText: string }[]]>();
		this.edits.forEach(e => {
			if (!map.has(e.uri.fsPath)) { map.set(e.uri.fsPath, [e.uri, []]); }
			map.get(e.uri.fsPath)![1].push(e);
		});
		return [...map.values()];
	}
}

export enum SymbolKind {
	File = 0, Module = 1, Namespace = 2, Package = 3, Class = 4, Method = 5, Property = 6,
	Field = 7, Constructor = 8, Enum = 9, Interface = 10, Function = 11, Variable = 12,
	Constant = 13, String = 14, Number = 15, Boolean = 16, Array = 17, Object = 18,
	Key = 19, Null = 20, EnumMember = 21, Struct = 22, Event = 23, Operator = 24, TypeParameter = 25
}

export enum CompletionItemKind {
	Text = 0, Method = 1, Function = 2, Constructor = 3, Field = 4, Variable = 5, Class = 6,
	Interface = 7, Module = 8, Property = 9, Unit = 10, Value = 11, Enum = 12, Keyword = 13,
	Snippet = 14
}

export enum EndOfLine { LF = 1, CRLF = 2 }

export class TextLine {
	constructor(public text: string, public lineNumber: number) {}

	get range() { return new Range(this.lineNumber, 0, this.lineNumber, this.text.length); }
	get isEmptyOrWhitespace() { return !this.text.trim(); }
	get firstNonWhitespaceCharacterIndex() { return this.text.length - this.text.trimStart().length; }
}

const DEFAULT_WORD = /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)/g;

export class TextDocument {
	uri: Uri;
	isClosed = false;
	private lines: string[];

	constructor(fsPath: string, text: string) {
		this.uri = Uri.file(fsPath);
		this.lines = text.split(/\r?\n/);
	}

	get fileName() { return this.uri.fsPath; }
	get lineCount() { return this.lines.length; }
	get eol() { return EndOfLine.LF; }

	lineAt(line: number | Position) {
		const n = typeof line === 'number' ? line : line.line;
		return new TextLine(this.lines[n], n);
	}

	getText(range?: Range) {
		if (!range) {
			return this.lines.join('\n');
		}
		return this.lines[range.start.line].substring(range.start.character, range.end.character);
	}

	getWordRangeAtPosition(position: Position, regex: RegExp = DEFAULT_WORD) {
		const text = this.lines[position.line] ?? '';
		const re = new RegExp(regex.source, 'g' + regex.flags.replace('g', ''));
		let m: RegExpExecArray | null;
		while ((m = re.exec(text))) {
			if (!m[0].length) {
				re.lastIndex++;
				continue;
			}
			if (m.index <= position.character && position.character <= m.index + m[0].length) {
				return new Range(position.line, m.index, position.line, m.index + m[0].length);
			}
			if (m.index > position.character) {
				break;
			}
		}
		return undefined;
	}
}

/** Registry of "opened" documents, keyed by absolute path. Falls back to the real file system. */
const documents = new Map<string, TextDocument>();

export const registerDocument = (doc: TextDocument) => { documents.set(doc.fileName, doc); return doc; };
export const resetDocuments = () => documents.clear();

export const workspaceConfig: Record<string, any> = {
	editor: { tabSize: 8, insertSpaces: false, formatOnType: false },
	files: { eol: '\n', include: '**/*.{a80,asm,inc,s}', exclude: null },
};

const noopEvent = () => ({ dispose() { /* nothing */ } });

export const workspace = {
	async findFiles() { return []; },
	async openTextDocument(arg: string | Uri) {
		const p = path.resolve(typeof arg === 'string' ? arg : arg.fsPath);
		let doc = documents.get(p);
		if (!doc) {
			doc = new TextDocument(p, fs.readFileSync(p, 'utf8')); // throws when missing, like VS Code
			documents.set(p, doc);
		}
		return doc;
	},
	onDidChangeTextDocument: noopEvent,
	onDidChangeConfiguration: noopEvent,
	createFileSystemWatcher() {
		return { onDidChange: noopEvent, onDidCreate: noopEvent, onDidDelete: noopEvent, dispose() { /* nothing */ } };
	},
	getConfiguration: () => workspaceConfig,
};

export const window = { visibleTextEditors: [] as any[] };

export const executedCommands: string[] = [];
export const commands = {
	async executeCommand(cmd: string) { executedCommands.push(cmd); }
};

export const languages = {};
