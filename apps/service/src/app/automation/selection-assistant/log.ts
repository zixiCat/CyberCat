import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { SelectionAssistantEntry } from './types';

const parseLogLine = (value: string): SelectionAssistantEntry | null => {
  if (!value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as SelectionAssistantEntry;
  } catch {
    return null;
  }
};

export const appendSelectionAssistantLog = async (
  logFilePath: string,
  entry: SelectionAssistantEntry
): Promise<void> => {
  await fs.mkdir(path.dirname(logFilePath), { recursive: true });
  await fs.appendFile(logFilePath, `${JSON.stringify(entry)}\n`, 'utf8');
};

export const readSelectionAssistantLatestLogEntry = async (logFilePath: string): Promise<SelectionAssistantEntry | null> => {
  return fs.readFile(logFilePath, 'utf8')
    .then((fileContent) => {
      const entries = fileContent
        .split(/\r?\n/)
        .map(parseLogLine)
        .filter((entry): entry is SelectionAssistantEntry => entry !== null);

      return entries.at(-1) ?? null;
    })
    .catch((err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }

      throw err;
    });
};