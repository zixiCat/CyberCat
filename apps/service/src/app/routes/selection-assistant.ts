import { FastifyInstance } from 'fastify';
import { closeSseStream, openSseStream, writeSseEvent } from '../services/commands';

export default async function (fastify: FastifyInstance) {
  fastify.get(
    '/selection-assistant/stream',
    async (_request, reply) => {
      openSseStream(reply);
      writeSseEvent(reply, 'snapshot', fastify.selectionAssistant.getSnapshot());

      const unsubscribe = fastify.selectionAssistant.subscribe((entry: any) => {
        writeSseEvent(reply, 'entry', { entry });
      });

      reply.raw.on('close', () => {
        unsubscribe();
        closeSseStream(reply);
      });
    }
  );
}