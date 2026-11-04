import * as path from 'path';
import { runTests } from '@vscode/test-electron';

// Launches a real VS Code instance with the extension loaded and runs `suite/index` inside it.
async function main() {
	const root = path.resolve(__dirname, '../../..');

	try {
		await runTests({
			extensionDevelopmentPath: root,
			extensionTestsPath: path.resolve(__dirname, 'suite', 'index'),
			launchArgs: [
				path.join(root, 'test', 'fixtures'), // workspace folder
				'--disable-extensions',
				'--disable-workspace-trust',
			],
			vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH, // optional: skip the download
			version: process.env.VSCODE_TEST_VERSION || 'stable',
		});
	}
	catch (err) {
		console.error('E2E tests failed:', err);
		process.exit(1);
	}
}

main();
