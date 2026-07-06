import { spawn } from 'node:child_process';

type PowerShellOptions = {
  readonly sta?: boolean;
};

export const runPowerShell = async (script: string, options: PowerShellOptions = {}): Promise<string> => {
  const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');

  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      ...(options.sta ? ['-STA'] : []),
      '-EncodedCommand',
      encodedCommand,
    ]);

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;

      if (code !== 0) {
        const message = stderr.trim() || stdout.trim() || `PowerShell exited with code ${code}.`;
        reject(new Error(message));
        return;
      }

      resolve(stdout.trim());
    });
  });
};