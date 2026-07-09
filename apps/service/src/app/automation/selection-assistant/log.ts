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

export const readSelectionAssistantLog = async (
  logFilePath: string,
  historyLimit: number
): Promise<SelectionAssistantEntry[]> => {
  try {
    const fileContent = await fs.readFile(logFilePath, 'utf8');

    return fileContent
      .split(/\r?\n/)
      .map(parseLogLine)
      .filter((entry): entry is SelectionAssistantEntry => entry !== null)
      .slice(-historyLimit)
      .reverse();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw err;
  }
};