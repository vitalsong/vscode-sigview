# Signal View

Visual Studio Code extension for viewing signals in debug mode

## Features

![SpectrumUI](./images/spectrum.png)

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

## Restrictions

Variables are read through the vscode local scope. For this reason, plot can hang on large vectors. For C/C++ this is solved by using an address/pointer, since the readMemory command is significantly faster.

Until I have solved this problem, try not to draw too large arrays (size > 10'000).
