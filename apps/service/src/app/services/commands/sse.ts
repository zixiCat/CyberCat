import { FastifyReply } from 'fastify';

export const writeSseEvent = (reply: FastifyReply, event: string, data: unknown) => {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
};

export const openSseStream = (reply: FastifyReply) => {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
};

export const closeSseStream = (reply: FastifyReply) => {
  if (!reply.raw.writableEnded) {
    reply.raw.end();
  }
};