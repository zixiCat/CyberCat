import path from 'node:path';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { readSelectionAssistantConfig } from '../automation/selection-assistant/config';
import { createTranslationHistory } from '../services/translation/translation-history';
import { translate } from '../services/translation/translate';
import { checkEnglishSpelling } from '../services/translation/english-spelling';
import {
  translationEntrySchema,
  translationHistorySchema,
  translationRequestSchema,
} from '../services/translation/translation-schema';

export default async function (fastify: FastifyInstance) {
  const routes = fastify.withTypeProvider<TypeBoxTypeProvider>();
  const config = readSelectionAssistantConfig();
  const historyPath = path.resolve(process.env.SCRIPTS_ROOT || '.', 'tmp/translation-history.json');
  const history = createTranslationHistory(historyPath);

  routes.get('/translation/history', {
    schema: { response: { 200: translationHistorySchema } },
  }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return history.read();
  });

  routes.post('/translation', {
    schema: {
      body: translationRequestSchema,
      response: { 200: Type.Object({ entry: translationEntrySchema, history: translationHistorySchema }) },
    },
  }, async (request, reply) => {
    const query = request.body.query.trim();
    try {
      const spelling = await checkEnglishSpelling(query);
      if ((!spelling || request.body.translateAsWritten) && !config.apiKey) {
        return reply.serviceUnavailable('Translation needs a configured Selection Assistant API key.');
      }
      const result = spelling && !request.body.translateAsWritten
        ? spelling
        : await translate(config, query, Boolean(spelling));
      const entry = { query, result };
      return { entry, history: await history.save(entry) };
    } catch (error) {
      request.log.warn({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Translation lookup failed');
      return reply.badGateway('Could not complete the lookup. Try again.');
    }
  });
}
