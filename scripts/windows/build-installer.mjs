import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { get as httpsGet } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const packageJsonPath = join(repoRoot, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const appVersion = packageJson.version ?? '0.1.1';
const bundleOnly = process.argv.includes('--bundle-only');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pythonCommand = join(repoRoot, '.venv', 'Scripts', 'python.exe');
const pyInstallerWorkPath = join(repoRoot, 'build', 'CyberCat', 'pyinstaller');
const pyInstallerDistPath = join(repoRoot, 'build', 'CyberCat', 'bundle');
const bundledAppPath = join(pyInstallerDistPath, 'CyberCat');

// Inno Setup auto-download config
const INNO_VERSION = '6.7.1';
const INNO_RELEASE_TAG = `is-${INNO_VERSION.replaceAll('.', '_')}`;
const INNO_URL = `https://github.com/jrsoftware/issrc/releases/download/${INNO_RELEASE_TAG}/innosetup-${INNO_VERSION}.exe`;
const innoToolsDir = join(repoRoot, '.tools', 'innosetup');
const isccCache = join(innoToolsDir, 'ISCC.exe');

if (process.platform !== 'win32') {
  console.error('Windows packaging is only supported on win32 hosts.');
  process.exit(1);
}

runCommand(
  npmCommand,
  ['run', 'build', '--', '--skipSync'],
  'Build the React frontend',
  { shell: true },
);
runCommand(
  pythonCommand,
  [
    '-m',
    'PyInstaller',
    '--noconfirm',
    '--clean',
    '--distpath',
    pyInstallerDistPath,
    '--workpath',
    pyInstallerWorkPath,
    'apps/service/CyberCat.spec',
  ],
  'Build the desktop bundle with PyInstaller',
  { shell: false },
);

if (bundleOnly) {
  process.exit(0);
}

const innoSetup = await resolveOrDownloadInnoSetup();

runCommand(
  innoSetup,
  [
    `/DAppVersion=${appVersion}`,
    `/DBundleSourceDir=${bundledAppPath}`,
    'installer/CyberCat.iss',
  ],
  'Build the Windows installer with Inno Setup',
  { shell: false },
);

function runCommand(command, args, label, options = {}) {
  console.log(`\n==> ${label}`);
  if (!options.shell && !existsSync(command)) {
    console.error(`Required executable not found: ${command}`);
    process.exit(1);
  }

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      CI: '1',
      NX_TUI: 'false',
    },
    stdio: 'inherit',
    shell: options.shell ?? false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveInnoSetup() {
  const configured = process.env.INNO_SETUP_PATH;
  if (configured && existsSync(configured)) {
    return configured;
  }

  if (existsSync(isccCache)) {
    return isccCache;
  }

  const whereResult = spawnSync('where.exe', ['ISCC.exe'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });

  if (whereResult.status === 0) {
    const resolvedPath = whereResult.stdout.split(/\r?\n/).find(Boolean);
    if (resolvedPath && existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  const candidates = [
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function resolveOrDownloadInnoSetup() {
  const found = resolveInnoSetup();
  if (found) return found;

  console.log(`\n==> Inno Setup not found — downloading v${INNO_VERSION} (one-time setup)`);

  mkdirSync(join(repoRoot, '.tools'), { recursive: true });
  const installerPath = join(repoRoot, '.tools', `innosetup-${INNO_VERSION}.exe`);

  await downloadFile(INNO_URL, installerPath);
  console.log('    Download complete. Running silent install...');

  const result = spawnSync(
    installerPath,
    ['/VERYSILENT', '/SUPPRESSMSGBOXES', `/DIR=${innoToolsDir}`, '/NOICONS', '/NORESTART'],
    { stdio: 'inherit' },
  );

  if (result.status !== 0 || !existsSync(isccCache)) {
    console.error('Inno Setup silent install failed. Set INNO_SETUP_PATH to ISCC.exe and retry.');
    process.exit(1);
  }

  console.log(`    Inno Setup installed to .tools/innosetup/`);
  return isccCache;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (targetUrl) => {
      httpsGet(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode} for ${targetUrl}`));
          return;
        }
        const file = createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}