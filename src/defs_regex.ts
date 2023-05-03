const mkRegex = (str: TemplateStringsArray, opts: string = 'i') =>
	new RegExp(str.raw[0].replace(/\s/gm, ''), opts);

export default {
	commentLine: /^(?:\s*;+|\/{2,})\s*(.*)$/,
	endComment: /(?:;+|\/{2,})\s*(.*)$/,
	includeLine: /(\binclude\s+)((["'])([^\3]+)\3).*$/i,
	macroLine: /\b(macro\s+)(\w+)(?:\s+([^\/;$]+))?/i,
	moduleLine: /\b(module\s+)(\w+)\b/i,
	endmoduleLine: /\bendmod(ule)?\b/i,
	controlKeywordLine: mkRegex`
		\b(
			rept|e?dup|end[mprsw]|exitm|endmod(ule)?|(?:de|un)?phase|
			(end)?(struct|section|switch|lua|maxnest)|while|repeat|[rw]end|
			if|ifn?def|ifn?used|ifn?exist|else(if)?|endif|
			until|(else|end)?case|default|break
		)\b`,
	horizontalRule: /^(.)\1+$/,
	fullLabel: /((\$\$(?!\.))?[\w\.]+)/,
	partialLabel: /(?:\$\$(?!\.)|\.)?(\w+)/,
	stringBounds: /(["'])(?:(?=(\\?))\2.)*?\1/g,
	bracketsBounds: /^\[([^\]\n]*?)]|\(([^\)\n]*?)\)$/,
	numerals: mkRegex`
		(
			((?:(?:\-|\b)(?:0b)|%)[01]+)|
			(\b[01]+b\b)|
			((?:(?:\-|\b)(?:0x)|[\$#])[0-9a-f]+)|
			((?:\-|\b)[0-9a-f]+h\b)|
			((?:(?:\-|\b)(?:0q?)|@)[0-7]+)|
			((?:\-|\b)[0-7]+o\b)|
			((?:\-|\b)\d+)
		)(?!\w+)`,
	registers: /\b(?:[abcdefhlir]|ix|iy|af'?|bc|de|hl|pc|sp|ix[hlu]|iy[hlu]|[lh]x|x[lh]|[lh]y|y[lh])\b/i,
	condFlags: /\b(j[pr]|call|ret)(?:\s+([cmpz]|n[cz]|p[eo]))$/i,
	regsOrConds: /^([abcdefhlimprz]|ix|iy|af'?|bc|de|hl|pc|sp|ix[hlu]|iy[hlu]|[lh]x|x[lh]|[lh]y|y[lh]|n[cz]|p[eo])\b/i,
	operators: /(?<=["'\w\)】])((?:\s*(?:[+\-\/%\^#]|[><=~&!\^\|\*]{1,2}|>>>|>=|<=|=>|<>|!=)\s*)|(?:\s+(?:mod|shl|shr|and|or|xor)\s+))(?=[\w\$#%\.\(【'"])/gi,
	labelDefinition: /^\@?((\$\$(?!\.))?[\w\.]+)(:|\s|$)/,
	parentLabel: /^(((\@|\$\$)(?!\.))?\w[\w\.]*)(?::|\s|$)/,
	evalExpression: /^\@?([\w\.]+)((?:\:?\s*)=\s*|(?:\:\s*|\s+)(?:(?:equ|eval)\s+))(.+)(;.*)?$/i,
	shouldSuggestInstruction: /^(\@?((\$\$(?!\.))?[\w\.]+)[:\s])?\s*(\w+)?(?!.+)$/,
	shouldSuggest1ArgRegister: mkRegex`
		((?:
			(pop|push)|
			(cp|in|s[lr]a|s[lr]l|slia|sl1|sub|and|te?st|x?or|mul)|
			(ex|ld|inc|dec|adc|add|sbc)
		)
		\s+)[[(]?([a-z]\w*)?$`,
	shouldSuggest2ArgRegister: mkRegex`
		(
			adc|add|bit|ex|ld|out|res|r[lr]c?|set|
			s[lr]a|s[lr]l|slia|sl1|sbc|
			nextreg|bs[lr]a|bsr[lf]|brlc
		)
		\s+(\w+|\([^\)]+?\)|\[[^\]]+?\]),\s*?[[(]?([^[(\n]*)$`,
	shouldSuggestConditionals: /(j[pr]|call|ret)\s+$/,
	defineExpression: mkRegex`
		^\@?([\w\.]+)\:?\s+(
			inc(?:bin|hob|trd)|b?include|includelua|insert|binary|
			inc(?:l4[89]|lz4|zx7|exo)|read|
			def[bdghlmswir]|d[bcghmswz]|abyte[cz]?|byte|d?word|hex
		)\s+([^\$;]+)(;.*)?$`,
	keyword: mkRegex`^(
		equ|eval|[fr]?org|end|end?t|align|(?:de|un)?phase|shift|
		save(?:bin|dev|hob|nex|sna|tap|trd)|empty(?:tap|trd)|
		inc(?:bin|hob|trd)|b?include|includelua|insert|binary|out(?:put|end)|tap(?:out|end)|
		fpos|fname|slot|size|opt|page|newpage|radix|outradix|encoding|charset|codepage|
		macexp_(?:dft|ovr)|listing|(?:end)?(?:struct|section|switch|lua|maxnest)|
		cpu|device|proc|label|local|global|shared|public|forward|export|
		e?dup|block|rept|macro|end[mprsw]|exitm|module|endmod(?:ule)?|(?:de|un)?define|
		disp|textarea|map|mmu|field|defarray|segment|restore|pushv|popv|enum|enumconf|nextenum|
		list|nolist|let|labelslist|bplist|setbp|setbreakpoint|cspectmap|
		assert|fatal|error|warning|message|display|print|fail|
		shellexec|amsdos|breakpoint|buildcpr|buildsna|run|save|setcpc|setcrtc|
		repeat|until|(?:else|end)?case|default|break|stop|while|[rw]end|function|
		inc(?:l4[89]|lz4|zx7|exo)|lz(?:4[89]?|w7|exo|close)|read|
		bank|bankset|limit|protect|write\s+direct|str|
		def[bdlmswir]|d[bcdszw]|abyte[cz]?|byte|d?word|hex|
		if|ifn?def|ifn?used|ifn?exist|else(?:if)?|endif|
		ad[cd]|and|bit|call|ccf|cp|cp[di]r?|cpl|daa|dec|[de]i|djnz|ex[adx]?|halt|
		i[mn]|inc|in[di]r?|j[pr]|ld|ld[di]r?|neg|nop|ot[di]r|out|out[di]|
		pop|push|res|ret[in]?|rla?|rlca?|r[lr]d|rra?|rrca?|rst|sbc|scf|set|
		s[lr]a|s[lr]l|slia|sl1|sub|x?or|
		swap|ldir?x|ldws|lddr?x|ldpirx|outinb|swapnib|
		mul|mirror|nextreg|pixel(ad|dn)|setae|te?st|
		bs[lr]a|bsr[lf]|brlc
	)$`,
};
