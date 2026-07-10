import { randomUUID } from 'node:crypto';
import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { runPowerShell } from '../selection-shortcuts';

export const writeAudioToTempFile = (audioData: Buffer) => {
  const filePath = path.join(os.tmpdir(), `cybercat-selection-speaker-${randomUUID()}.wav`);

  fs.writeFileSync(filePath, audioData);

  return filePath;
};

export const playAudioFile = async (filePath: string): Promise<void> => {
  const escapedPath = filePath.replace(/'/g, "''");

  await runPowerShell(`
$player = New-Object System.Media.SoundPlayer '${escapedPath}'
$player.PlaySync()
`);
};

export const deleteAudioFile = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore temp cleanup failures.
  }
};