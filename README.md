## Support for Z80 macro-assemblers in Visual Studio Code

The **Z80 Macro-Assembler** extension for Visual Studio Code provides the following features inside VS Code:

* syntax highlighting for Z80 assembly sources of well known Z80 macro-assemblers, for example:
  - [SjASM](http://www.xl2s.tk/) or [SjASMPlus](https://github.com/z00m128/sjasmplus)
  - [Macroassembler AS](http://john.ccac.rwth-aachen.de:8000/as/)
  - [Pasmo](http://pasmo.speccy.org/)
* [problem matchers](#problem-matchers) for **SjASMPlus** and **Macroassembler AS** compilation output
* snippets for macros and source control keywords
* label and symbol documenter on hover, defintion provider, completition proposer
  - is highly recommended to set `"editor.acceptSuggestionOnEnter": "off"` in your user, workspace or folder settings

### Credits

This extension was done by **Martin Bórik** as a compilation of derived work inspired by these VS Code extensions:
- [`z80asm-vscode`](https://github.com/Imanolea/z80asm-vscode) by **Imanol Barriuso**
- [`vscode-pasmo`](https://github.com/BouKiCHi/vscode-pasmo) by **BouKiCHi**
- [`rgbds-vscode`](https://github.com/DonaldHays/rgbds-vscode) by **Donald Hays**

### Problem matchers

There are some predefined problem matchers to handle reported errors from compilation output:
- `errmatcher-as` for **Macroassembler AS**
- `errmatcher-sjasmplus` for **SjASMPlus**

These values can be used in `.vscode/tasks.json` of your project's build task, for example:
```json
    ...
    "problemMatcher": "$errmatcher-sjasmplus"
    ...
```

### License

The Z80 Assembly extension is subject to [these license terms](LICENSE).

The source code to this extension is available on [github](https://github.com/mborik/z80-macroasm-vscode) and licensed under the [MIT license](LICENSE).
