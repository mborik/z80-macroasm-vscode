/* eslint-disable no-multi-spaces */

export default {
	// Z80 instruction set
	instructions: [
		'adc\t',  'add\t',  'and\t',  'bit\t',  'call\t', 'ccf\n',  'cp\t',   'cpd\n',
		'cpdr\n', 'cpi\n',  'cpir\n', 'cpl\n',  'daa\n',  'dec\t',  'di\n',   'ei\n',
		'djnz\t', 'ex\t',   'exa\n',  'exd\n',  'exx\n',  'halt\n', 'im\t',   'in\t',
		'inc\t',  'ind\n',  'indr\n', 'ini\n',  'inir\n', 'jp\t',   'jr\t',   'ld\t',
		'ldd\n',  'lddr\n', 'ldi\n',  'ldir\n', 'neg\n',  'nop\n',  'or\t',   'otdr\n',
		'otir\n', 'out\t',  'outd\n', 'outi\n', 'pop\t',  'push\t', 'res\t',  'ret\t',
		'reti\n', 'retn\n', 'rl\t',   'rla\n',  'rlc\t',  'rlca\n', 'rld\n',  'rr\t',
		'rra\n',  'rrc\t',  'rrca\n', 'rrd\n',  'rst\t',  'sbc\t',  'scf\n',  'set\t',
		'sla\t',  'slia\t', 'sll\t',  'sl1\t',  'swap\t', 'sra\t',  'srl\t',  'sub\t',
		'xor\t'
	],
	// Z80N - ZX-Spectrum Next extended instruction set
	nextInstructions: [
		'ldix\n',   'ldirx\n',  'lddx\n',   'lddrx\n',  'ldws\n',   'ldpirx\n', 'mirror\n',
		'mul\t',    'nextreg\t','outinb\n', 'pixelad\n','pixeldn\n','setae\n',  'swapnib\n',
		'test\t',   'bsla\t',   'bsra\t',   'bsrl\t',   'bsrf\t',   'brlc\t'
	],
	registers: [
		/*  0 */ 'a', 'b', 'c', 'd', 'e', 'h', 'l', 'i', 'r',
		/*  9 */ '(hl)', '(de)', '(bc)', '(ix+*)', '(iy+*)', '(c)',
		/* 15 */ 'ixl', 'ixh', 'ixu', 'lx', 'hx', 'xl', 'xh',
		/* 22 */ 'iyl', 'iyh', 'iyu', 'ly', 'hy', 'yl', 'yh',
		/* 29 */ 'hl', 'de', 'bc', 'af', 'ix', 'iy',
		/* 35 */ 'sp', '(sp)', '(ix)', '(iy)'
	],
	conditionals: ['c', 'nc', 'z', 'nz', 'p', 'm', 'po', 'pe'],

	// quick pointers into `registers`
	regR16Index: 29,
	regStackIndex: 35,
};
