import type { SelectionAssistantController } from './app/automation/selection-assistant';
import type { createSelectionAssistantRunner } from './app/automation/selection-assistant/runner';

declare module 'fastify' {
  interface FastifyInstance {
    selectionAssistant: SelectionAssistantController & { run: ReturnType<typeof createSelectionAssistantRunner> };
  }
}
