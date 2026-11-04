// Mocha `--require` hook: resolves `import 'vscode'` to the in-memory mock,
// because the real module exists only inside the VS Code Extension Host.
import Module = require('module');
import * as vscodeMock from './mocks/vscode';

const m = Module as any;
const originalLoad = m._load;

m._load = function (request: string, ...rest: any[]) {
	if (request === 'vscode') {
		return vscodeMock;
	}
	return originalLoad.call(this, request, ...rest);
};

// The sources have a circular import (configProperties <-> extension <-> formatProcessor)
// which is only safe when `extension` is the entry point, as in the real Extension Host.
require('../../src/extension');
