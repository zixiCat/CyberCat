import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { app } from './app/app';

export interface ServerOptions {
  webRoot?: string;
}

export const createServer = ({ webRoot }: ServerOptions = {}) => {
  const server = Fastify({ logger: true });

  server.register(app, { apiPrefix: webRoot ? '/api' : '' });

  if (webRoot) {
    server.addHook('onRequest', (request, reply, done) => {
      const address = server.server.address();
      const localOrigin = typeof address === 'object' && address
        ? `http://127.0.0.1:${address.port}`
        : '';
      const origin = request.headers.origin;
      const fetchSite = request.headers['sec-fetch-site'];

      if ((origin && origin !== localOrigin) || (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none')) {
        reply.code(403).send({ message: 'Forbidden' });
        return;
      }

      done();
    });

    server.register(fastifyStatic, { root: path.resolve(webRoot), wildcard: false });
    server.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ message: 'Not Found' });
      }

      return reply.sendFile('index.html');
    });
  }

  return server;
};
