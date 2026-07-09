import { FastifyInstance } from 'fastify';
import { closeSseStream, openSseStream, writeSseEvent } from '../services/commands';

export default async function (fastify: FastifyInstance) {
  fastify.get(
    '/selection-assistant/stream',
    async (_request, reply) => {
      openSseStream(reply);
      writeSseEvent(reply, 'snapshot', fastify.selectionAssistant.getSnapshot());

      const unsubscribe = fastify.selectionAssistant.subscribe((event) => {
        if (event.type === 'entry') {
          writeSseEvent(reply, 'entry', { entry: event.entry });
          return;
        }

        writeSseEvent(reply, 'status', { status: event.status });
      });

      reply.raw.on('close', () => {
        unsubscribe();
        closeSseStream(reply);
      });
    }
  );
}