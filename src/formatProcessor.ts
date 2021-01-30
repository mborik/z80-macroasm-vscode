import * as vscode from 'vscode';
import { ConfigPropsProvider } from './configProperties';
import regex from './defs_regex';

interface LinePartFrag {
	keyword?: string;
	args?: string[];
	comment?: string;
}

interface LineParts extends LinePartFrag {
	label?: string;
	colonAfterLabel?: boolean;
	fragments?: LinePartFrag[];
}

type FormatProcessorOutput = vscode.ProviderResult<vscode.TextEdit[]>;

export class FormatProcessor extends ConfigPropsProvider {
	format(document: vscode.TextDocument, range: vscode.Range): FormatProcessorOutput {
		const configProps = this.getConfigProps(document);
		const startLineNumber = document.lineAt(range.start).lineNumber;
		const endLineNumber = document.lineAt(range.end).lineNumber;

		const generateIndent = (count: number, snippet?: string, keepAligned?: boolean) => {
			const tabsSize = configProps.indentSize * count;

			let prepend = '';
			let fillSpacesBySnippet = 0;
			if (snippet) {
				prepend += snippet;
				if (snippet.length >= tabsSize && keepAligned) {
					prepend += configProps.eol;
				}
				else {
					fillSpacesBySnippet = tabsSize - snippet.length;
				}
			}

			if (configProps.indentSpaces) {
				return prepend + ' '.repeat(tabsSize - fillSpacesBySnippet);
			}
			else {
				return prepend + '\t'.repeat(
					Math.ceil(
						(tabsSize - fillSpacesBySnippet) / configProps.indentSize
					)
				);
			}
		}

		const processFragment = (frag: string) => {
			const fullMeaningMatch = regex.fullMeaningExpression.exec(frag);
			if (!fullMeaningMatch) {
				const [ keyword, ...args ] = frag.split(/\s*,\s*/);
				const lastOne = args.pop() as string;
				return {
					keyword: keyword.trim(),
					args: [ ...args.map(arg => `${arg.trim()},`), lastOne ]
				};
			}

			const [, keyword, firstParam, optionalParams ] = fullMeaningMatch;
			const args = optionalParams ? optionalParams.split(/\s+|\s*,\s*/) : [];
			args.unshift(firstParam);

			return {
				keyword,
				args: args.map(arg => arg.trim())
			};
		}

		let output: vscode.TextEdit[] = [];

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; ++lineNumber) {
			let line = document.lineAt(lineNumber);

			if (line.range.isEmpty) {
				continue;
			} else if (line.isEmptyOrWhitespace) {
				// trim whitespace-filled lines
				output.push(new vscode.TextEdit(line.range, ''));
				continue;
			}

			const range = new vscode.Range(line.range.start, line.range.end);

			let text = line.text;
			let indentLevel = -1;
			let lineParts: LineParts = {};

			const commentLineMatch = regex.commentLine.exec(text);
			if (commentLineMatch) {
				continue;
			}

			const endCommentMatch = regex.endComment.exec(text);
			if (endCommentMatch) {
				let idx = endCommentMatch.index;
				while (/\s/.test(text[idx - 1])) {
					idx--;
				}

				range.end.translate(0, idx - text.length);
				text = text.substr(0, idx);
			}

			const evalMatch = regex.evalExpression.exec(text);
			if (evalMatch) {
				const [ fullMatch, label, keyword, arg ] = evalMatch;

				indentLevel = configProps.baseIndent;
				lineParts.label = label;
				if (keyword[0] === ':') {
					lineParts.colonAfterLabel = true;
					lineParts.keyword = keyword.slice(1).trim();
				}
				else {
					lineParts.keyword = keyword.trim();
				}
				lineParts.args = [arg];

				text = text.replace(fullMatch, '').trim();
			}

			const labelMatch = regex.labelDefinition.exec(text);
			if (labelMatch) {
				const [ fullMatch, label, keyword ] = labelMatch;

				indentLevel = configProps.baseIndent;
				lineParts.label = label; // TODO detect colorAfterLabel
				lineParts.keyword = keyword;

				text = text.replace(fullMatch, '').trim();
			}

			const moduleLineMatch = regex.moduleLine.exec(text);
			const macroLineMatch = regex.macroLine.exec(text);
			const includeLineMatch = regex.includeLine.exec(text);

			if (moduleLineMatch) {
				const [ fullMatch, keyword ] = moduleLineMatch;

				indentLevel = configProps.controlIndent;
				lineParts.keyword = keyword;
				lineParts.args = [text.replace(fullMatch, '').trim()];

				text = ''
			}

			if (text) {
				if (indentLevel < 0) {
					indentLevel = configProps.baseIndent;
				}

				if (configProps.splitInstructionsByColon) {
					lineParts.fragments = text.split(/\s*\:\s*/).map(frag => processFragment(frag));
				}
				else {
					const { keyword, args } = processFragment(text.trim());
					lineParts.keyword = keyword;
					lineParts.args = args;
				}
			}

			const newText: string[] = [];
			if (lineParts.label) {
				const label = `${lineParts.label}${(
					(configProps.colonAfterLabels === 'no-change' && lineParts.colonAfterLabel) ||
						configProps.colonAfterLabels) ? ':' : ''}`;
				newText.push(generateIndent(indentLevel, label, true))
			}
			else {
				newText.push(generateIndent(indentLevel))
			}

			(
				lineParts.fragments ||
				[{ keyword: lineParts.keyword, args: lineParts.args }]
			).forEach(({ keyword, args }, index) => {
				if (index) {
					newText.push(configProps.eol + generateIndent(indentLevel))
				}

				if (keyword) {
					if (configProps.whitespaceAfterInstruction === 'single-space') {
						newText.push(`${keyword} `);
					}
					else if (configProps.whitespaceAfterInstruction === 'tab') {
						newText.push(`${keyword}\t`);
					}
					else {
						newText.push(generateIndent(indentLevel, keyword))
					}
				}

				if (args && args.length) {
					args.forEach(argument => {
						// TODO detect brackets
						newText.push(`${argument},${configProps.spaceAfterFirstArgument ? ' ' : ''}`);
					})
				}
			});

			output.push(new vscode.TextEdit(range, newText.join('')))
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
