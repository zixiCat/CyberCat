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
} | {
  kind: 'interpretation';
  translation: string;
  explanation: string;
  interpretedAs?: string;
} | {
  kind: 'unrecognized';
  suggestions: string[];
  suggestionSource: 'english-spelling' | 'ai';
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

export const searchTranslation = async (query: string, signal: AbortSignal, translateAsWritten = false) => {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/translation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, translateAsWritten }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    throw new Error('Could not reach the translation service. Check your connection and retry.');
  }
  return readResponse<{ entry: TranslationEntry; history: TranslationEntry[] }>(response);
};
