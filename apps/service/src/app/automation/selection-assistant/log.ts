import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export const appendSelectionAssistantOutput = async (
  logFilePath: string,
  outputText: string
): Promise<void> => {
  await fs.mkdir(path.dirname(logFilePath), { recursive: true });
  const separator = await fs.stat(logFilePath)
    .then(({ size }) => size > 0 ? '\n\n---\n\n' : '')
    .catch((err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return '';
      }

      throw err;
    });

  await fs.appendFile(logFilePath, `${separator}${outputText.trim()}\n`, 'utf8');
};