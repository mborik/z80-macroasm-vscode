import * as vscode from 'vscode';
import { ConfigPropsProvider } from './configProperties';

type FormatProcessorOutput = vscode.ProviderResult<vscode.TextEdit[]>;

export class FormatProcessor extends ConfigPropsProvider {
	format(document: vscode.TextDocument, range: vscode.Range): FormatProcessorOutput {
		const configProps = this.getConfigProps(document);
		const startLineNumber = document.lineAt(range.start).lineNumber;
		const endLineNumber = document.lineAt(range.end).lineNumber;

		let output: vscode.TextEdit[] = [];

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; ++lineNumber) {
			let line = document.lineAt(lineNumber);
			let text = line.text;

			// TBD
		}

		return output;
	}
}

export class Z80DocumentFormatter implements vscode.DocumentFormattingEditProvider {
	constructor(public formatter: FormatProcessor) {}

	provideDocumentFormattingEdits(document: vscode.TextDocument): FormatProcessorOutput {
		const range = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length - 1));
		return this.formatter.format(document, range);
	}
}

export class Z80DocumentRangeFormatter implements vscode.DocumentRangeFormattingEditProvider {
	constructor(public formatter: FormatProcessor) {}

	provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range): FormatProcessorOutput {
		return this.formatter.format(document, range);
	}
}

export class Z80TypingFormatter implements vscode.OnTypeFormattingEditProvider {
	constructor(public formatter: FormatProcessor) {}

	provideOnTypeFormattingEdits(document: vscode.TextDocument, position: vscode.Position): FormatProcessorOutput {
		return this.formatter.format(document, document.lineAt(position.line).range);
	}
}
