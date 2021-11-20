import * as vscode from 'vscode';
import { ConfigPropsProvider } from './configProperties';
import regex from './defs_regex';

interface LinePartFrag {
	keyword: string;
	firstParam?: string;
	args?: string[];
}

interface LineParts extends LinePartFrag {
	label?: string;
	colonAfterLabel?: boolean;
	fragments?: LinePartFrag[];
}

type FormatProcessorOutput = vscode.ProviderResult<vscode.TextEdit[]>;
type EvalSpecificRegExpExecArray = RegExpExecArray & { notIndented?: boolean } | null;

export class FormatProcessor extends ConfigPropsProvider {
	format(document: vscode.TextDocument, range: vscode.Range, isOnType: boolean = false): FormatProcessorOutput {
		const configProps = this.getConfigProps(document);
		const startLineNumber = document.lineAt(range.start).lineNumber;
		const endLineNumber = document.lineAt(range.end).lineNumber;
		const commaAfterArgument = ',' + (configProps.spaceAfterArgument ? ' ' : '');

		const safeSplitStringByChar = (input: string, splitter: string) => {
			const stringsMatches: string[] = [];
			return input
				.replaceAll(regex.stringBounds, (match) => {
					const i = stringsMatches.push(match);
					return `【${i.toString().padStart(3, '0')}】`;
				})
				.split(splitter)
				.map((fragment) =>
					fragment.replaceAll(/【(\d+)】/g, (_, counter) => {
						return stringsMatches[parseInt(counter) - 1];
					})
				);
		};

		const generateIndent = (count: number, snippet?: string, keepAligned?: boolean) => {
			const tabsSize = configProps.indentSize * count;

			let prepend = '';
			let fillSpacesAfterSnippet = tabsSize;
			if (snippet) {
				prepend += snippet;
				if (keepAligned && snippet.length >= tabsSize) {
					prepend += configProps.eol;
				}
				else {
					while (snippet.length >= fillSpacesAfterSnippet) {
						fillSpacesAfterSnippet += configProps.indentSize;
					}

					fillSpacesAfterSnippet -= snippet.length;
				}
			}

			if (configProps.indentSpaces) {
				return prepend + ' '.repeat(fillSpacesAfterSnippet);
			}
			else {
				return prepend + '\t'.repeat(
					Math.ceil(fillSpacesAfterSnippet / configProps.indentSize)
				);
			}
		};

		const processFragment = (frag: string): LinePartFrag => {
			const [, keyword = frag, rest ] = frag.match(/^(\S+)\s+(.*)$/) || [];
			const args: string[] = [];
			if (typeof rest === 'string') {
				if (rest.includes(',')) {
					safeSplitStringByChar(rest, ',').forEach((arg, idx) => {
						const ret = arg.trimEnd();
						args.push(idx ? ret.trimStart() : ret);
					});
				}
				else {
					args.push(rest);
				}
			}
			return { keyword, args };
		};

		const adjustKeywordCase = (keyword: string, checkRegsOrConds: boolean = false): string => {
			if (configProps.uppercaseKeywords !== 'auto' && (
				regex.keyword.test(keyword) ||
				(checkRegsOrConds && regex.regsOrConds.test(keyword))
			)) {
				if (configProps.uppercaseKeywords) {
					return keyword.toUpperCase();
				}
				else {
					return keyword.toLowerCase();
				}
			}

			return keyword;
		};

		const output: vscode.TextEdit[] = [];

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; ++lineNumber) {
			const line = document.lineAt(lineNumber);

			if (line.range.isEmpty) {
				continue;
			}
			else if (line.isEmptyOrWhitespace) {
				// trim whitespace-filled lines
				output.push(new vscode.TextEdit(line.range, ''));
				continue;
			}

			let range = new vscode.Range(line.range.start, line.range.end);

			let text = line.text;
			let indentLevel = -1;
			const lineParts: LineParts = {} as any;

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

				range = new vscode.Range(range.start, range.end.translate(0, idx - text.length));
				text = text.substr(0, idx);
			}

			const evalMatch: EvalSpecificRegExpExecArray = regex.evalExpression.exec(text);
			if (evalMatch) {
				const [ fullMatch, label, keyword, argument ] = evalMatch;

				indentLevel = configProps.baseIndent;
				lineParts.args = [ argument ];
				lineParts.label = `${fullMatch[0] === '@' ? '@' : ''}${label}`;

				if (keyword[0] === ':') {
					lineParts.colonAfterLabel = true;
					lineParts.keyword = keyword.slice(1).trim();
				}
				else {
					lineParts.keyword = keyword.trim();
				}

				if (lineParts.keyword === '=') {
					evalMatch.notIndented = !/(\t| {2,})=/.test(fullMatch);
				}

				text = text.replace(fullMatch, '').trim();
			}

			const labelMatch = regex.labelDefinition.exec(text);
			if (labelMatch) {
				const [ fullMatch, label,, colon ] = labelMatch;

				indentLevel = configProps.baseIndent;
				lineParts.label = `${fullMatch[0] === '@' ? '@' : ''}${label}`;
				lineParts.colonAfterLabel = (colon === ':');

				text = text.replace(fullMatch, '').trim();
			}

			const trimmedText = text.trim();
			const moduleLineMatch = regex.moduleLine.exec(trimmedText);
			const macroLineMatch = regex.macroLine.exec(trimmedText);
			const controlKeywordMatch = regex.controlKeywordLine.exec(trimmedText);

			if (moduleLineMatch?.index === 0) {
				const [, keyword ] = moduleLineMatch;

				indentLevel = configProps.controlIndent;
				lineParts.keyword = keyword.trim();
				lineParts.args = [ text.replace(keyword, '').trim() ];

				text = '';
			}
			else if (macroLineMatch?.index === 0) {
				const [, keyword, firstParam, rest ] = macroLineMatch;

				indentLevel = configProps.controlIndent;
				lineParts.keyword = keyword.trim();
				lineParts.firstParam = firstParam;
				lineParts.args = [];
				if (typeof rest === 'string') {
					if (rest.includes(',')) {
						safeSplitStringByChar(rest, ',').forEach((arg, idx) => {
							const ret = arg.trimEnd();
							lineParts.args?.push(idx ? ret.trimStart() : ret);
						});
					}
					else {
						lineParts.args.push(rest);
					}
				}

				text = '';
			}
			else if (controlKeywordMatch?.index === 0) {
				indentLevel = configProps.controlIndent;
			}

			if (text.trim()) {
				if (indentLevel < 0) {
					indentLevel = configProps.baseIndent;
				}

				if (configProps.splitInstructionsByColon && text.includes(':')) {
					const splitLine = safeSplitStringByChar(text, ':');
					if (splitLine.length > 1) {
						lineParts.fragments = splitLine.map(frag => processFragment(frag.trim()));
					}
				}

				if (!lineParts.fragments) {
					const { keyword, args } = processFragment(text.trim());
					lineParts.keyword = keyword;
					lineParts.args = args;
				}
			}

			const newText: string[] = [];
			if (lineParts.label) {
				const label = `${lineParts.label}${(
					(configProps.colonAfterLabels === 'no-change' && lineParts.colonAfterLabel) ||
						configProps.colonAfterLabels === true) ? ':' : ''}`;

				if (evalMatch?.notIndented) {
					newText.push(`${label} `);
				}
				else {
					newText.push(generateIndent(indentLevel, label, true));
				}
			}
			else {
				if (indentLevel < 0) {
					indentLevel = configProps.indentDetector
						.exec(line.text)?.filter(Boolean).slice(1).length || 0;
				}

				newText.push(generateIndent(indentLevel));
			}

			(lineParts.fragments || [{ ...lineParts }]).forEach(
				({ keyword, firstParam, args = [] }, index) => {
					if (!keyword) {
						return;
					}

					if (index) {
						newText.push(
							configProps.splitInstructionsByColon ?
								(configProps.eol + generateIndent(indentLevel)) : ': '
						);
					}

					if (configProps.whitespaceAfterInstruction === 'single-space' ||
						evalMatch?.notIndented) {

						newText.push(`${adjustKeywordCase(keyword)} `);
					}
					else if (configProps.whitespaceAfterInstruction === 'tab') {
						newText.push(`${adjustKeywordCase(keyword)}\t`);
					}
					else {
						newText.push(generateIndent(1, adjustKeywordCase(keyword)));
					}

					if (firstParam) {
						newText.push(`${firstParam} `);
					}

					args.forEach((value, idx) => {
						let result, matcher;

						if (configProps.bracketType !== 'no-change' &&
							(matcher = regex.bracketsBounds.exec(value))) {

							const content = matcher[2] || matcher[1] || '';
							result = `${
								configProps.bracketType === 'round' ? '(' : '['}${
								adjustKeywordCase(content, true)}${
								configProps.bracketType === 'round' ? ')' : ']'}`;
						}
						if (configProps.hexaNumberStyle !== 'no-change' &&
							(matcher = regex.numerals.exec(value))) {

							let hexa = (matcher[5] || matcher[4]);
							if (hexa) {
								const [, sign, reparsed ] = /^(\-?)(?:0x|[\$#])?(\w+)h?$/i.exec(hexa) || [ '', '', hexa ];
								hexa = (configProps.hexaNumberCase === 'no-change') ? reparsed :
									reparsed[configProps.hexaNumberCase ? 'toUpperCase' : 'toLowerCase']();
								switch (configProps.hexaNumberStyle) {
									case 'hash':
										result = `${sign}#${hexa}`; break;
									case 'motorola':
										result = `${sign}$${hexa}`; break;
									case 'intel':
										result = `${sign}${hexa.charCodeAt(0) > 64 ? '0' : ''}${hexa}h`; break;
									case 'intel-uppercase':
										result = `${sign}${hexa.charCodeAt(0) > 64 ? '0' : ''}${hexa}h`; break;
									case 'c-style':
										result = `${sign}0x${hexa}`; break;
								}
							}
						}

						newText.push((idx ? commaAfterArgument : '') +
							(result || adjustKeywordCase(value, true)));
					});
				}
			);

			let result = newText.join('');

			// Don't trim for on-type formatting, it interferes with typing, much more fluent this way.
			if (!isOnType) {
				result = result.trimEnd();
			}

			output.push(new vscode.TextEdit(range, result));
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

	provideOnTypeFormattingEdits(document: vscode.TextDocument, position: vscode.Position, ch: string): FormatProcessorOutput {
		// If enter is pressed, we should format the line that was being edited before, not the new line.
		let line = position.line;
		if (ch === '\n' && line > 0) {
			line--;
		}

		return this.formatter.format(document, document.lineAt(line).range, true);
	}
}
