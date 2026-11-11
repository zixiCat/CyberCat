import nspell from 'nspell';
import type { TranslationResult } from './translation-schema';

// Load once, on demand. Keep each dictionary's affix rules with its own words.
let dictionaries: Promise<ReturnType<typeof nspell>[]> | undefined;
const loadDictionaries = () => dictionaries ??= Promise.all([
  import('dictionary-en'),
  import('dictionary-en-gb'),
]).then((modules) => modules.map(({ default: dictionary }) => nspell({
  aff: Buffer.from(dictionary.aff),
  dic: Buffer.from(dictionary.dic),
})));

export const checkEnglishSpelling = async (query: string): Promise<TranslationResult | null> => {
  const word = query.replaceAll('’', "'");
  if (!/^[a-z]+(?:['-][a-z]+)*$/i.test(word)) {
    return null;
  }

  const checkers = await loadDictionaries();
  if (checkers.some((checker) => checker.correct(word))) {
    return null;
  }

  // Avoid expensive suggestion generation for pasted identifiers or nonsense.
  const suggestions = word.length <= 64
    ? [...new Set(checkers.flatMap((checker) => checker.suggest(word)))].slice(0, 5)
    : [];
  return { kind: 'unrecognized', sourceLanguage: 'en', suggestions, suggestionSource: 'english-spelling' };
};
