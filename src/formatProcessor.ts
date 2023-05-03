import * as vscode from 'vscode';
import { ConfigProps, ConfigPropsProvider } from './configProperties';
import regex from './defs_regex';
import { safeSplitStringByChar } from './utils';

interface LinePartFrag {
	keyword: string;
	fillSpace?: boolean;
	firstParam?: string;
	args?: string[];
}

interface LineParts extends LinePartFrag {
	label?: string;
	colonAfterLabel?: boolean;
	fragments?: LinePartFrag[];
}

interface GenerateIndentProps extends ConfigProps {
	level: number;
	snippet?: string;
	keepAligned?: boolean;
}

interface AdjustKeywordCaseProps extends ConfigProps {
	keyword: string;
	checkRegsOrConds?: boolean;
}

type FormatProcessorOutput = vscode.ProviderResult<vscode.TextEdit[]>;
type EvalSpecificRegExpExecArray = RegExpExecArray & { notIndented?: boolean } | null;

export class FormatProcessor extends ConfigPropsProvider {
	private _adjustKeywordCase({ keyword, checkRegsOrConds, ...opt }: AdjustKeywordCaseProps): string {
		if (opt.uppercaseKeywords !== 'auto' && (
			regex.keyword.test(keyword) ||
			(checkRegsOrConds && regex.regsOrConds.test(keyword))
		)) {
			if (opt.uppercaseKeywords) {
				return keyword.toUpperCase();
			}
			else {
				return keyword.toLowerCase();
			}
		}

		return keyword;
	}

	private _generateIndent({ level, snippet, keepAligned, ...opt }: GenerateIndentProps) {
		const tabsSize = opt.indentSize * level;

		let prepend = '';
		let fillSpacesAfterSnippet = tabsSize;
		if (snippet) {
			prepend += snippet;
			if (keepAligned && snippet.length >= tabsSize) {
				prepend += opt.eol;
			}
			else {
				while (snippet.length >= fillSpacesAfterSnippet) {
					fillSpacesAfterSnippet += opt.indentSize;
				}

				fillSpacesAfterSnippet -= snippet.length;
			}
		}

		if (opt.indentSpaces) {
			return prepend + ' '.repeat(fillSpacesAfterSnippet);
		}
		else {
			return prepend + '\t'.repeat(
				Math.ceil(fillSpacesAfterSnippet / opt.indentSize)
			);
		}
	}

	private _processFragment(frag: string): LinePartFrag {
		const [, keyword = frag, rest ] = frag.match(/^(\S+)\s+(.*)$/) || [];
		const args: string[] = [];
		if (typeof rest === 'string') {
			if (rest.includes(',')) {
				safeSplitStringByChar(rest, ',').forEach((arg, idx) => {
					args.push(idx ? arg.trimStart() : arg);
				});
			}
			else {
				args.push(rest);
			}
		}
		return { keyword, args };
	}

//---------------------------------------------------------------------------------------
	format(
		document: vscode.TextDocument,
		range: vscode.Range,
		isOnType: boolean = false
	): FormatProcessorOutput {
		const configProps = this.getConfigProps(document);
		const startLineNumber = document.lineAt(range.start).lineNumber;
		const endLineNumber = document.lineAt(range.end).lineNumber;
		const commaAfterArgument = ',' + (configProps.spaceAfterArgument ? ' ' : '');
		const fragmentSeparator = `${configProps.spaceAfterInstruction ? ' ' : ''}: `;

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
				text = text.substring(0, idx);
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

			const trimmedText = isOnType ? text.trimStart() : text.trim();
			const moduleLineMatch = regex.moduleLine.exec(trimmedText);
			const macroLineMatch = regex.macroLine.exec(trimmedText);
			const controlKeywordMatch = regex.controlKeywordLine.exec(trimmedText);
			const trailingWhitespaceMatch = /\S(\s*)$/.exec(text);

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

				if (text.includes(':')) {
					// stop processing multi-instruction lines on type when it should be splitted
					if (configProps.splitInstructionsByColon && isOnType) {
						continue;
					}

					const splitLine = safeSplitStringByChar(text, ':');
					if (splitLine.length > 1) {
						lineParts.fragments = splitLine.map(
							frag => this._processFragment(frag.trim())
						);

						// test if user just not starting to type an instruction at the end of line
						const trailingColonMatch = /:\s*$/.exec(text);
						if (!configProps.splitInstructionsByColon && isOnType && trailingColonMatch) {
							const lastFragmentIndex = lineParts.fragments.length - 1;
							lineParts.fragments[lastFragmentIndex].fillSpace = true;
						}
					}
				}

				if (!lineParts.fragments) {
					const trimmedText = isOnType ? text.trimStart() : text.trim();
					const { keyword, args } = this._processFragment(trimmedText);
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
					newText.push(
						this._generateIndent({
							...configProps,
							level: indentLevel,
							snippet: label,
							keepAligned: true,
						})
					);
				}
			}
			else {
				if (indentLevel < 0) {
					indentLevel = configProps.indentDetector
						.exec(line.text)?.filter(Boolean).slice(1).length || 0;
				}

				newText.push(
					this._generateIndent({
						...configProps,
						level: indentLevel,
					})
				);
			}

			(lineParts.fragments || [{ ...lineParts }]).forEach(
				({ keyword, firstParam, fillSpace, args = [] }, index) => {
					if (!keyword && fillSpace == null) {
						return;
					}

					if (index) {
						const lastFrag = newText.pop();
						if (lastFrag) {
							newText.push(lastFrag.trimEnd());
						}

						if (configProps.splitInstructionsByColon) {
							newText.push(
								(configProps.eol + this._generateIndent({
									...configProps,
									level: indentLevel,
								}))
							);
						}
						else if (fillSpace) {
							newText.push(fragmentSeparator.trimEnd());
							return;
						}
						else {
							newText.push(fragmentSeparator);
						}

						newText.push(`${this._adjustKeywordCase({ ...configProps, keyword })} `);
					}
					else {
						if (configProps.whitespaceAfterInstruction === 'single-space' ||
							evalMatch?.notIndented) {

							newText.push(`${this._adjustKeywordCase({ ...configProps, keyword })} `);
						}
						else if (configProps.whitespaceAfterInstruction === 'tab') {
							newText.push(`${this._adjustKeywordCase({ ...configProps, keyword })}\t`);
						}
						else {
							newText.push(
								this._generateIndent({
									...configProps,
									level: 1,
									snippet: this._adjustKeywordCase({ ...configProps, keyword })
								})
							);
						}
					}

					if (firstParam) {
						newText.push(`${firstParam} `);
					}

					let wasOperator = false;
					args.flatMap(arg => {
						const stringsMatches: string[] = [];
						const safeArg = arg.replaceAll(regex.stringBounds, (match) => {
							const i = stringsMatches.push(match);
							return `【${i.toString().padStart(3, '0')}】`;
						});

						const results: string[] = [];
						const matches = safeArg.matchAll(regex.operators);
						let beginIndex = 0;
						for (const match of matches) {
							const { [1]: operator, input, index } = match;
							if (input && index) {
								results.push(input.slice(beginIndex, index), `⨂${operator.trim()}`);
								beginIndex = index + operator.length;
							}
						}
						results.push(safeArg.slice(beginIndex));

						return results.map((fragment) =>
							fragment.replaceAll(/【(\d+)】/g, (_, counter) => {
								return stringsMatches[parseInt(counter) - 1];
							})
						);

					}).forEach((value, idx) => {
						if (value[0] === '⨂') {
							const operator = value.slice(1).trim();
							const space = (
								configProps.spacesAroundOperators ||
								/[a-z]+/i.test(operator) ? ' ' : ''
							);

							newText.push(space + value.slice(1) + space);
							wasOperator = true;
							return;
						}

						let result, matcher;
						if (configProps.bracketType !== 'no-change' &&
							(matcher = regex.bracketsBounds.exec(value))) {

							const content = matcher[2] || matcher[1] || '';
							result = `${
								configProps.bracketType === 'round' ? '(' : '['}${
								this._adjustKeywordCase({
									...configProps,
									keyword: content,
									checkRegsOrConds: true
								})}${
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

						if (idx && !wasOperator) {
							newText.push(commaAfterArgument);
						}
						newText.push(
							(result || this._adjustKeywordCase({
								...configProps,
								keyword: value,
								checkRegsOrConds: true
							}))
						);

						wasOperator = false;
					});
				}
			);

			let result = newText.join('').trimEnd();
			if (isOnType && trailingWhitespaceMatch) {
				result += trailingWhitespaceMatch[1];
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
		// if enter is pressed, format line that was being edited before, not the new line
		let line = position.line;
		if (ch === '\n' && line > 0) {
			line--;
		}

		return this.formatter.format(document, document.lineAt(line).range, ch !== '\n');
	}
}
