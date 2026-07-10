import fastify from 'fastify';

import {
  SelectionAssistantController,
} from '../automation/selection-assistant';

declare module 'fastify' {
  interface FastifyInstance {
    selectionAssistant: SelectionAssistantController;
  }
}