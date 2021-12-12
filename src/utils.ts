import regex from './defs_regex';

const utils = {
	safeSplitStringByChar:
		(input: string, splitter: string) => {
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
		},

	isFirstLetterUppercase:
		(input: string) => (!!input && input[0] >= 'A' && input[0] <= 'Z'),

	uppercaseIfNeeded:
		(input: string, ucase: boolean) => (ucase ? input.toUpperCase() : input),

	pad:
		(num: number, width: number = 2) => {
			const a = num.toString(16);
			return ('0000000000' + a).substr(-Math.max(width, a.length)).toUpperCase();
		}
};

export = utils;
