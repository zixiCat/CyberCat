import { apiBaseUrl } from '../../api-base-url';

export type TranslationLanguage = 'en' | 'zh';

export type TranslationResult = {
  sourceLanguage: TranslationLanguage;
} & ({
  kind: 'word';
  pronunciation: string;
  meanings: { partOfSpeech: string; senses: string[] }[];
} | {
  kind: 'sentence';
  casual: string;
  standard: string;
});

export type TranslationEntry = { query: string; result: TranslationResult };

const readResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.message === 'string' ? body.message : 'Could not reach the translation service.');
  }
  return response.json();
};

export const readTranslationHistory = async (signal: AbortSignal) =>
  readResponse<TranslationEntry[]>(await fetch(`${apiBaseUrl}/translation/history`, { signal }));

export const searchTranslation = async (query: string, signal: AbortSignal) =>
  readResponse<{ entry: TranslationEntry; history: TranslationEntry[] }>(
    await fetch(`${apiBaseUrl}/translation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal,
    }),
  );
