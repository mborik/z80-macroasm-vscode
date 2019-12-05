const utils = {
	'isFirstLetterUppercase':
		(input: string) => (input[0] >= 'A' && input[0] <= 'Z'),

	'uppercaseIfNeeded':
		(input: string, ucase: boolean) => (ucase ? input.toUpperCase() : input),

	'pad':
		(num: number, width: number = 2) => {
			let a = num.toString(16);
			return ('0000000000' + a).substr(-Math.max(width, a.length)).toUpperCase();
		}
};

export = utils;
