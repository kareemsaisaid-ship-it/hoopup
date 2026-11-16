import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../node_modules/@playwright/test/cli.js');

const child = spawn(
  process.execPath,
  [cliPath, 'test', '--project=Connected API'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      CONNECTED_E2E: '1',
    },
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

