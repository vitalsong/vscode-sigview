# Signal View

Visual Studio Code extension for viewing signals in debug mode

## Features

![SpectrumUI](./images/how-to-use.gif)

- Time domain plot;
- Spectrum plot;
- Real/Complex signal;
- Update for each step of the debugger;
- Access to nested objects (example obj1._data._array);
- Read and view memory by address/pointer (experimental for `C/C++`);
- Caching scope variables;
- Works via `vscode.DebugSession` (those. most languages ​​should be supported);

## Install

```sh
cd vscode-sigview
npm update
vsce package
code --install-extension sigview-0.0.X.vsix
```

## Commands

`SigView: Create view panel` to create panel with plot on current debug session.


## Usage

### Scope variables

This is the standard method for arrays that appear in the `Run & Debug: variables` window. Should work for all languages.

Disadvantages: 
- long loading of large arrays
- limited accuracy depending on the number display format

For nested variables, use the dot (`.`) symbol for each nesting level in `variables` window. Example: `this.audio_.channels_.[0]`

### Memory variables (C/C++)

If you write in C/C++, then you're in luck (just kidding).
You can access an array by a pointer or address in memory. 
It is enough to specify the address in the format `0x0000...` or name of the pointer variable. 
The extension will try to detect the data type automatically, but you can also change the `type` and `endian` manually.

Use this option instead of `scope variables` if possible. Reading directly from memory is much faster. You will also get accurate values ​​without format error.

> To get the address of the first array element, use the `debug console` and the command: `p &arr[0]`

## Restrictions

Variables are read through the vscode local scope. For this reason, plot can hang on large vectors. For C/C++ this is solved by using an address/pointer, since the readMemory command is significantly faster.

Until I have solved this problem, try not to draw too large arrays (size > 10'000).
