const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
const output = `desktop-release/build-${timestamp}-${process.pid}`;
const builder = path.join(repoRoot, 'node_modules', 'electron-builder', 'cli.js');
const electronDist = path.join(repoRoot, 'node_modules', 'electron', 'dist');
const builderArgs = [builder, ...process.argv.slice(2), `--config.directories.output=${output}`];

if (existsSync(path.join(electronDist, 'electron.exe'))) {
  builderArgs.push(`--config.electronDist=${electronDist}`);
}

const result = spawnSync(
  process.execPath,
  builderArgs,
  { cwd: repoRoot, env: process.env, stdio: 'inherit' }
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  process.stdout.write(`CyberCat package: ${output}\n`);
}
