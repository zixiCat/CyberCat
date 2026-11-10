import { Type, type Static } from '@sinclair/typebox';

const languageSchema = Type.Union([Type.Literal('en'), Type.Literal('zh')]);
const textSchema = Type.String({ minLength: 1, pattern: '\\S' });

export const translationResultSchema = Type.Union([
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
]);

export const translationRequestSchema = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 4000, pattern: '\\S' }),
});

export const translationEntrySchema = Type.Intersect([
  translationRequestSchema,
  Type.Object({ result: translationResultSchema }),
]);

export const translationHistorySchema = Type.Array(translationEntrySchema, { maxItems: 100 });

export type TranslationResult = Static<typeof translationResultSchema>;
export type TranslationEntry = Static<typeof translationEntrySchema>;
