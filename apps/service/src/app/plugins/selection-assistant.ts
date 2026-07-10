import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { UiohookKeyboardEvent } from 'uiohook-napi';
import {
  appendSelectionAssistantLog,
  buildSelectionAssistantPrompts,
  createSelectionAssistantController,
  generateSelectionAssistantResponse,
  readSelectionAssistantConfig,
  readSelectionAssistantLatestLogEntry,
  type SelectionAssistantController,
  type SelectionAssistantEntry,
} from '../automation/selection-assistant';
import {
  getGlobalSelectedText,
  matchesHotkey,
  parseHotkey,
  registerGlobalKeydownListener,
} from '../automation/selection-shortcuts';

declare module 'fastify' {
  interface FastifyInstance {
    selectionAssistant: SelectionAssistantController;
  }
}

const assertSelectionAssistantRuntime = (
  config: ReturnType<typeof readSelectionAssistantConfig>,
): void => {
  if (process.platform !== 'win32') {
    throw new Error('Selection assistant is only supported on Windows.');
  }

  if (!config.apiKey) {
    throw new Error('Selection assistant requires SELECTION_ASSISTANT_API_KEY or OPENAI_API_KEY.');
  }
};

const createSelectionAssistantEntry = (
  config: ReturnType<typeof readSelectionAssistantConfig>,
  shortcut: string,
  inputText: string,
  outputText: string,
  errorMessage?: string
): SelectionAssistantEntry => ({
  id: randomUUID(),
  createdAt: new Date().toISOString(),
  shortcut,
  inputText,
  outputText,
  errorMessage,
  model: config.model,
  promptFilePath: config.promptFilePath,
});

const runSelectionAssistantTask = (
  config: ReturnType<typeof readSelectionAssistantConfig>,
  shortcut: string,
  fastify: FastifyInstance
): Promise<SelectionAssistantEntry | null> => {
  let inputText = '';

  return getGlobalSelectedText()
    .then((selectedText) => {
      inputText = selectedText.trim();

      if (!inputText) {
        fastify.log.warn('Selection assistant did not capture any selected text.');
        return null;
      }

      return buildSelectionAssistantPrompts(config.promptFilePath, inputText)
        .then((prompts) => generateSelectionAssistantResponse(config, prompts))
        .then((outputText) => createSelectionAssistantEntry(config, shortcut, inputText, outputText));
    })
    .catch((err) => {
      fastify.log.error({ err }, 'Selection assistant failed.');

      return createSelectionAssistantEntry(
        config,
        shortcut,
        inputText,
        '',
        err instanceof Error ? err.message : 'Selection assistant failed.'
      );
    });
};

export default fp(async function selectionAssistantPlugin(fastify: FastifyInstance) {
  const config = readSelectionAssistantConfig();
  assertSelectionAssistantRuntime(config);
  const hotkey = parseHotkey(config.shortcut);
  const initialEntry = await readSelectionAssistantLatestLogEntry(config.logFilePath);
  const controller = createSelectionAssistantController(hotkey.shortcut, initialEntry);

  fastify.decorate('selectionAssistant', controller);

  let isRunning = false;

  const onKeyDown = (event: UiohookKeyboardEvent): void => {
    if (!matchesHotkey(hotkey, event)) {
      return;
    }

    if (isRunning) {
      fastify.log.warn('Selection assistant ignored a trigger while work was already in progress.');
      return;
    }

    isRunning = true;
    void runSelectionAssistantTask(config, hotkey.shortcut, fastify)
      .then((entry) => {
        if (!entry) {
          return;
        }

        controller.publish(entry);

        void appendSelectionAssistantLog(config.logFilePath, entry).catch((err) => {
          fastify.log.error({ err, logFilePath: config.logFilePath }, 'Selection assistant could not write the local log entry.');
        });
      })
      .finally(() => {
        isRunning = false;
      });
  };

  const stopListening = registerGlobalKeydownListener(onKeyDown);

  fastify.log.info(
    {
      logFilePath: config.logFilePath,
      model: config.model,
      promptFilePath: config.promptFilePath,
      shortcut: hotkey.shortcut,
    },
    'Selection assistant started.'
  );

  fastify.addHook('onClose', async () => {
    stopListening();
  });
});