import { Type, type Static } from '@sinclair/typebox';

const languageSchema = Type.Union([Type.Literal('en'), Type.Literal('zh')]);
const textSchema = Type.String({ minLength: 1, pattern: '\\S' });
const querySchema = Type.String({ minLength: 1, maxLength: 4000, pattern: '\\S' });

export const generatedTranslationSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('word'),
    sourceLanguage: languageSchema,
    pronunciation: textSchema,
    meanings: Type.Array(Type.Object({
      partOfSpeech: textSchema,
      senses: Type.Array(textSchema, { minItems: 1 }),
    }), { minItems: 1 }),
  }),
  Type.Object({
    kind: Type.Literal('sentence'),
    sourceLanguage: languageSchema,
    casual: textSchema,
    standard: textSchema,
  }),
  Type.Object({
    kind: Type.Literal('interpretation'),
    sourceLanguage: languageSchema,
    translation: textSchema,
    explanation: textSchema,
    interpretedAs: Type.Optional(textSchema),
  }),
  Type.Object({
    kind: Type.Literal('unrecognized'),
    sourceLanguage: languageSchema,
    suggestions: Type.Array(textSchema, { maxItems: 5, uniqueItems: true }),
    suggestionSource: Type.Literal('ai'),
  }),
]);

export const translationResultSchema = Type.Union([
  generatedTranslationSchema,
  Type.Object({
    kind: Type.Literal('unrecognized'),
    sourceLanguage: Type.Literal('en'),
    suggestions: Type.Array(textSchema, { maxItems: 5, uniqueItems: true }),
    suggestionSource: Type.Literal('english-spelling'),
  }),
]);

export const translationRequestSchema = Type.Object({
  query: querySchema,
  translateAsWritten: Type.Optional(Type.Boolean()),
});

export const translationEntrySchema = Type.Object({ query: querySchema, result: translationResultSchema });

export const translationHistorySchema = Type.Array(translationEntrySchema, { maxItems: 100 });

export type TranslationResult = Static<typeof translationResultSchema>;
export type TranslationEntry = Static<typeof translationEntrySchema>;
