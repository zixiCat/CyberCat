import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export const appendSelectionAssistantOutput = async (
  logFilePaths: string[],
  outputText: string
): Promise<void> => {
  for (const logFilePath of logFilePaths) {
    try {
      await fs.access(path.dirname(logFilePath));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }

      throw err;
    }

    try {
      const separator = await fs.stat(logFilePath)
        .then(({ size }) => size > 0 ? '\n\n---\n\n' : '')
        .catch((err) => {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return '';
          }

          throw err;
        });

      await fs.appendFile(logFilePath, `${separator}${outputText.trim()}\n`, 'utf8');
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }

      throw err;
    }
  }

  throw new Error('No selection assistant log path is available.');
};