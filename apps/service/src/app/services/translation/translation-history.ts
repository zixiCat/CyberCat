import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { translationEntrySchema, type TranslationEntry } from './translation-schema';
import { checkEnglishSpelling } from './english-spelling';

const historyLimit = 100;

export const createTranslationHistory = (filePath: string) => {
  let pendingWrite: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<TranslationEntry[]> => {
    let contents: string;
    try {
      contents = await readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const history: unknown = JSON.parse(contents);
    if (!Array.isArray(history)) {
      throw new Error('Invalid translation history.');
    }
    const entries = history.filter((entry) => Value.Check(translationEntrySchema, entry)).slice(0, historyLimit);
    // Old AI entries may contain confidently defined typos. Recheck before display.
    return Promise.all(entries.map(async (entry) => entry.result.kind === 'word'
      ? { ...entry, result: await checkEnglishSpelling(entry.query) ?? entry.result }
      : entry));
  };

  const save = (entry: TranslationEntry) => {
    const write = pendingWrite.then(async () => {
      const history = await read();
      const next = [entry, ...history.filter((item) => item.query !== entry.query)].slice(0, historyLimit);
      await mkdir(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryPath, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
        await rename(temporaryPath, filePath);
      } finally {
        await rm(temporaryPath, { force: true });
      }
      return next;
    });
    pendingWrite = write.catch(() => undefined);
    return write;
  };

  return { read, save };
};
