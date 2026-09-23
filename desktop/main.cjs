const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let server;
let isClosing = false;
let mainWindow;

const repoRoot = path.resolve(__dirname, '..');
app.setName('CyberCat');

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

const prepareWorkspace = () => {
  if (!app.isPackaged) {
    return repoRoot;
  }

  const workspaceRoot = path.join(app.getPath('userData'), 'workspace');
  const defaultsRoot = path.join(process.resourcesPath, 'defaults');
  fs.mkdirSync(workspaceRoot, { recursive: true });

  for (const folder of ['commands', 'prompts']) {
    fs.cpSync(path.join(defaultsRoot, folder), path.join(workspaceRoot, folder), {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
  }

  const envPath = path.join(workspaceRoot, '.env');
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(path.join(defaultsRoot, '.env.example'), envPath);
  }

  return workspaceRoot;
};

const openWindow = (url) => {
  const window = new BrowserWindow({
    title: 'CyberCat',
    width: 1280,
    height: 850,
    minWidth: 660,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, destination) => {
    if (new URL(destination).origin !== new URL(url).origin) {
      event.preventDefault();
    }
  });

  void window.loadURL(url);
};

const start = async () => {
  const workspaceRoot = prepareWorkspace();
  process.chdir(workspaceRoot);
  process.env.SCRIPTS_ROOT = workspaceRoot;

  const envPath = path.join(workspaceRoot, '.env');
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }

  const webRoot = app.isPackaged
    ? path.join(app.getAppPath(), 'apps', 'web', 'dist')
    : path.join(repoRoot, 'apps', 'web', 'dist');
  const { createServer } = require('../apps/service/dist/apps/service/src/server.js');
  server = createServer({ webRoot });
  const address = await server.listen({ host: '127.0.0.1', port: 0 });
  openWindow(address);
};

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow?.focus();
  });

  app.whenReady().then(start).catch((error) => {
    dialog.showErrorBox('CyberCat could not start', String(error?.stack ?? error));
    app.exit(1);
  });
}

app.on('window-all-closed', () => app.quit());

app.on('before-quit', (event) => {
  if (!server || isClosing) {
    return;
  }

  event.preventDefault();
  isClosing = true;
  void server.close().finally(() => app.quit());
});
