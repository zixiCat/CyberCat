import { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { closeSseStream, openSseStream, writeSseEvent } from '../services/commands';

export default async function (fastify: FastifyInstance) {
  const routes = fastify.withTypeProvider<TypeBoxTypeProvider>();
  routes.post('/selection-assistant/run', {
    schema: {
      body: Type.Object({ inputText: Type.String({ minLength: 1 }) }),
      response: { 200: Type.String() },
    },
  }, async (request, reply) => {
    const inputText = request.body.inputText.trim();
    if (!inputText) return reply.badRequest('Enter some text to start the assistant.');
    const task = fastify.selectionAssistant.run(inputText);
    if (!task) return reply.conflict('The selection assistant is busy. Wait for the current response.');

    openSseStream(reply);
    writeSseEvent(reply, 'entry', { entry: task.entry });
    const unsubscribe = fastify.selectionAssistant.subscribe((entry) => {
      if (entry.id === task.entry.id && !reply.raw.destroyed) {
        writeSseEvent(reply, 'entry', { entry });
      }
    });
    reply.raw.on('close', unsubscribe);
    try {
      await task.completion;
      if (!reply.raw.destroyed) writeSseEvent(reply, 'done', {});
    } finally {
      unsubscribe();
      closeSseStream(reply);
    }
  });

  fastify.get(
    '/selection-assistant/stream',
    { schema: { response: { 200: Type.String() } } },
    async (_request, reply) => {
      openSseStream(reply);
      writeSseEvent(reply, 'snapshot', fastify.selectionAssistant.getSnapshot());

      const unsubscribe = fastify.selectionAssistant.subscribe((entry) => {
        writeSseEvent(reply, 'entry', { entry });
      });

      reply.raw.on('close', () => {
        unsubscribe();
        closeSseStream(reply);
      });
    }
  );
}
