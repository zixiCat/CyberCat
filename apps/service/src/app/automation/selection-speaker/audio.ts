import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';

export const writeAudioToTempFile = (audioData: Buffer) => {
  const filePath = path.join(os.tmpdir(), `cybercat-selection-speaker-${randomUUID()}.wav`);

  fs.writeFileSync(filePath, audioData);

  return filePath;
};

export type AudioPlayback = {
  play: (filePath: string) => Promise<void>;
  stop: () => void;
};

export const createAudioPlayback = (): AudioPlayback => {
  let process: ChildProcessWithoutNullStreams | null = null;

  const stop = (): void => {
    process?.kill();
    process = null;
  };

  const play = async (filePath: string): Promise<void> => {
    stop();

    const escapedPath = filePath.replace(/'/g, "''");
    const script = `$player = New-Object System.Media.SoundPlayer '${escapedPath}'\n$player.PlaySync()`;
    const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
    const playbackProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-STA',
      '-EncodedCommand',
      encodedScript,
    ]);
    process = playbackProcess;

    await new Promise<void>((resolve, reject) => {
      playbackProcess.once('error', reject);
      playbackProcess.once('close', (code) => {
        if (process === playbackProcess) {
          process = null;
        }

        if (code && code !== 0) {
          reject(new Error(`Audio playback exited with code ${code}.`));
          return;
        }

        resolve();
      });
    });
  };

  return { play, stop };
};

export const deleteAudioFile = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore temp cleanup failures.
  }
};