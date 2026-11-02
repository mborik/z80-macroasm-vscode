import * as fs from 'fs';
import * as path from 'path';
import Mocha = require('mocha');

// Entry point executed by VS Code itself: collects `*.test.js` files and runs them with Mocha.
export function run(): Promise<void> {
	const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 30000 });

	fs.readdirSync(__dirname)
		.filter(f => f.endsWith('.test.js'))
		.forEach(f => mocha.addFile(path.join(__dirname, f)));

	return new Promise((resolve, reject) => {
		mocha.run(failures => failures ? reject(new Error(`${failures} tests failed.`)) : resolve());
	});
}
