import * as vscode from 'vscode';
import { EXTENSION_LANGUAGE_ID } from './extension';

export interface ConfigProps {
	eol: string;
	formatOnType: boolean;
	indentSpaces: boolean;
	indentSize: number;
	indentDetector: RegExp;
	suggestOnInstructions: boolean;

	// format section
	baseIndent: number;
	controlIndent: number;
	whitespaceAfterInstruction: 'auto' | 'tab' | 'single-space';
	spaceAfterArgument: boolean;
	spaceAfterInstruction: boolean;
	spacesAroundOperators: boolean;
	uppercaseKeywords: 'auto' | boolean;
	bracketType: 'no-change' | 'round' | 'square';
	splitInstructionsByColon: boolean;
	colonAfterLabels: 'no-change' | boolean;
	hexaNumberStyle: 'no-change' | 'hash' | 'motorola' | 'intel' | 'intel-uppercase' | 'c-style';
	hexaNumberCase: 'no-change' | boolean;
}

export abstract class ConfigPropsProvider {
	constructor(public settings: vscode.WorkspaceConfiguration) {}

	getConfigProps(document: vscode.TextDocument) {
		const config = vscode.workspace.getConfiguration(undefined, { languageId: EXTENSION_LANGUAGE_ID });

		const indentSize = parseInt(config.editor.tabSize, 10) || 8;
		const result: ConfigProps = {
			...this.settings?.format,

			suggestOnInstructions: this.settings?.suggestOnInstructions === true,

			eol: (config.files.eol === vscode.EndOfLine.CRLF) ? '\r\n' : '\n',
			formatOnType: config.editor.formatOnType === true,
			indentSpaces: config.editor.insertSpaces === true,
			indentSize,

			indentDetector: RegExp('^' +
				`(\t|${' '.repeat(indentSize)})?`.repeat(
					Math.ceil(80 / indentSize)
				)
			)
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
