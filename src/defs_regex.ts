const mkRegex = (str: TemplateStringsArray, opts: string = 'i') =>
	new RegExp(str.raw[0].replace(/\s/gm, ''), opts);

export default {
	commentLine: /^(?:;+|\/{2,})\s*(.*)$/,
	endComment: /(?:;+|\/{2,})\s*(.*)$/,
	includeLine: /(\binclude\s+)((["'])([^\3]+)\3).*$/i,
	macroLine: /\b(macro\s+)(\w+)(?:\s+([^\/;$]+))?/i,
	moduleLine: /\b(module\s+)(\w+)\b/i,
	endmoduleLine: /\bendmod(ule)?\b/i,
	horizontalRule: /^(.)\1+$/,
	fullLabel: /((\$\$(?!\.))?[\w\.]+)/,
	partialLabel: /(?:\$\$(?!\.)|\.)?(\w+)/,
	stringBounds: /(["'])(?:([^\1]+)\1)/g,
	numerals: /^((\-?\d+)|((?:(?:\-?0x)|[\$#])[0-9a-f]+)|(\-?[0-9a-f]+h)|((?:(?:\-?0q)|@)[0-7]+)|([0-7]+o)|((?:(?:\-?0b)|%)[01]+)|([01]+b))$/i,
	registers: /\b(?:[abcdefhlir]|ix|iy|af'?|bc|de|hl|pc|sp|ix[hlu]|iy[hlu]|[lh]x|x[lh]|[lh]y|y[lh])\b/i,
	condFlags: /\b(j[pr]|call|ret)(?:\s+([cmpz]|n[cz]|p[eo]))\b/i,
	labelDefinition: /^\@?((\$\$(?!\.))?[\w\.]+)(?::|\s|$)/,
	parentLabel: /^(((\@|\$\$)(?!\.))?\w[\w\.]*)(?::|\s|$)/,
	evalExpression: /^\@?([\w\.]+)\:?\s+(=|equ|eval)\s+(.+)(;.*)?$/i,
	shouldSuggestInstruction: /^(\@?((\$\$(?!\.))?[\w\.]+)[:\s])?\s*(\w+)?(?!.+)$/,
	shouldSuggest1ArgRegister: mkRegex`
		(?:
			(pop|push)|
			(cp|in|s[lr]a|s[lr]l|slia|sl1|sub|and|te?st|x?or|mul)|
			(ex|ld|inc|dec|adc|add|sbc)
		)
		\s+\(?([a-z]\w*)?$`,
	shouldSuggest2ArgRegister: mkRegex`
		(
			adc|add|bit|ex|ld|out|res|r[lr]c?|set|
			s[lr]a|s[lr]l|slia|sl1|sbc|
			nextreg|bs[lr]a|bsr[lf]|brlc
		)
		\s+(\w+|\([^\)]+?\)),\s*?\(?([^\(\n]*)$`,
	defineExpression: mkRegex`
		^\@?([\w\.]+)\:?\s+(
			inc(?:bin|hob|trd)|b?include|includelua|insert|binary|
			inc(?:l4[89]|lz4|zx7|exo)|read|
			def[bdghlmswir]|d[bcghmswz]|abyte[cz]?|byte|d?word|hex
		)\s+([^\$;]+)(;.*)?$`,
	keyword: mkRegex`^(
		equ|eval|f?org|end?t|align|(?:de|un)?phase|shift|
		save(?:bin|dev|hob|nex|sna|tap|trd)|empty(?:tap|trd)|
		inc(?:bin|hob|trd)|b?include|includelua|insert|binary|end|out(?:put|end)|tap(?:out|end)|
		fpos|fname|page|slot|size|opt|outradix|
		cpu|device|encoding|charset|proc|local|shared|public|export|
		dup|edup|block|rept|macro|end[mpr]|exitm|module|endmod(?:ule)?|(?:un)?define|
		disp|textarea|map|mmu|field|defarray|list|nolist|let|labelslist|
		assert|fatal|error|warning|message|display|print|fail|
		shellexec|amsdos|breakpoint|buildcpr|buildsna|run|save|setcpc|setcrtc|
		repeat|rend|until|switch|case|default|break|endswitch|stop|while|wend|
		inc(?:l4[89]|lz4|zx7|exo)|lz(?:4[89]?|w7|exo|close)|read|
		bank|bankset|limit|protect|write\s+direct|str|(?:end)?struct|
		def[bdlmswir]|d[bcdszw]|abyte[cz]?|byte|d?word|hex|
		if|ifn?def|ifn?used|else|elseif|endif|
		ad[cd]|and|bit|call|ccf|cp|cp[di]r?|cpl|daa|dec|[de]i|djnz|exx?|halt|
		i[mn]|inc|in[di]r?|j[pr]|ld|ld[di]r?|neg|nop|ot[di]r|out|out[di]|
		pop|push|res|ret[in]?|rla?|rlca?|r[lr]d|rra?|rrca?|rst|sbc|scf|set|
		s[lr]a|s[lr]l|slia|sl1|sub|x?or|
		swap|ldir?x|ldws|lddr?x|ldpirx|outinb|swapnib|
		mul|mirror|nextreg|pixel(ad|dn)|setae|te?st|
		bs[lr]a|bsr[lf]|brlc
	)$`,
}
