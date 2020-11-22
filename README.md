# Support for Z80 macro-assemblers in Visual Studio Code

The **Z80 Macro-Assembler** extension for Visual Studio Code provides the following features inside VS Code:

* syntax highlighting for Z80 assembly sources of well known Z80 macro-assemblers, for example:
  - [SjASM](http://www.xl2s.tk/) or [SjASMPlus](https://github.com/z00m128/sjasmplus)
  - [Macroassembler AS](http://john.ccac.rwth-aachen.de:8000/as/)
  - [Pasmo](http://pasmo.speccy.org/)
  - [rasm](http://www.roudoudou.com/rasm/)
  - [tniASM](http://www.tni.nl/products/tniasm.html) (v0.x series)
* [problem matchers](#problem-matchers) for **SjASMPlus**, **Macroassembler AS**, **rasm** and **tniASM** compilation output
* label and symbol documenter on hover, defintion provider, completition proposer and rename provider
* macro documenter and argument definition provider
* snippets for macros and source control keywords

## Problem matchers

There are some predefined problem matchers to handle reported errors from compilation output:
- `errmatcher-as` for **Macroassembler AS**
- `errmatcher-sjasmplus` for **SjASMPlus**
- `errmatcher-sjasm` for **SjASM**
- `errmatcher-rasm` for **rasm**
- `errmatcher-tniasm` and `errmatcher-tniasm-preprocessor` for **tniASM**

These values can be used in `.vscode/tasks.json` of your project's build task, for example:
```json
    ...
    "problemMatcher": "$errmatcher-sjasmplus"
    ...
```

## IntelliSense showcase

### Symbol Provider:
- provide symbols or labels in current file in "Go to Symbol in File..." [`Ctrl+Shift+O`, `Cmd+Shift+O`]
- provide symbols or labels also in all includes in "Go to Symbol in Workspace..." [`Ctrl+T`, `Cmd+T`]

### Definition Provider:
> ![Definition provider](images/z80-macroasm-definition.png)

- Generated map of every symbol defined considers also modules or temporal labels:
> ![Peek Definition demo](images/z80-macroasm-definition-peek.gif)

### Completion Proposer
> ![Completion Proposer](images/z80-macroasm-completion.png)

- Inteligent completion of directives, pseudo-instructions, Z80 instructions, registers, labels or symbols:
> ![Completion and snippets demo](images/z80-macroasm-completion-demo.gif)

### Hover over symbol:
- Show symbol's value or specific definiton:
> ![Hover over symbol](images/z80-macroasm-hover.gif)

### Rename Provider
- Allow to rename labels, temporal labels, module names or macro indetifiers in InteliSense meaning.
> ![Renaming of symbols](images/z80-macroasm-rename.gif)


## Credits

This extension was done by **Martin Bórik** as a compilation of derived work inspired by these VS Code extensions:
- [`z80asm-vscode`](https://github.com/Imanolea/z80asm-vscode) by **Imanol Barriuso**
- [`vscode-pasmo`](https://github.com/BouKiCHi/vscode-pasmo) by **BouKiCHi**
- [`rgbds-vscode`](https://github.com/DonaldHays/rgbds-vscode) by **Donald Hays**

## License

The Z80 Assembly extension is subject to [these license terms](LICENSE).

The source code to this extension is available on [github](https://github.com/mborik/z80-macroasm-vscode) and licensed under the [MIT license](LICENSE).
