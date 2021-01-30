import * as vscode from 'vscode';

export interface ConfigProps {
	indentSpaces: boolean;
	indentSize: number;
	eol: string;
	whitespaceAfterInstruction: 'auto' |  'tab' | 'single-space';
	spaceAfterFirstArgument: boolean;
	uppercaseKeywords: 'auto' | boolean;
	bracketType: 'round' | 'square';
	baseIndent: number;
	controlIndent: number;
	colonAfterLabels: "no-change" | boolean;
	splitInstructionsByColon: boolean;
}

export abstract class ConfigPropsProvider {
	constructor(public settings: vscode.WorkspaceConfiguration) {}

	getConfigProps(document: vscode.TextDocument) {
		const config = vscode.workspace.getConfiguration();

		const result: ConfigProps = {
			...this.settings?.format,

			indentSpaces: (config.editor.insertSpaces === 'true'),
			indentSize: parseInt(config.editor.tabSize as any, 10) || 8,
			eol: (config.files.eol === vscode.EndOfLine.CRLF) ? '\r\n' : '\n'
		};

		// if this document is open, use the settings from that window
		vscode.window.visibleTextEditors.some(editor => {
			if (editor.document && editor.document.fileName === document.fileName) {
				result.indentSpaces = (editor.options.insertSpaces === true);
				result.indentSize = parseInt(editor.options.tabSize as any, 10) || 8;
				result.eol = (editor.document.eol === vscode.EndOfLine.CRLF) ? '\r\n' : '\n';
				return true;
			}
			return false;
		});

		return result;
	}
}
