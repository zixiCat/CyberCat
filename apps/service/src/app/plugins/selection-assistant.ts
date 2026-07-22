import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { UiohookKeyboardEvent } from 'uiohook-napi';
import {
  appendSelectionAssistantOutput,
  buildSelectionAssistantPrompts,
  createSelectionAssistantController,
  generateSelectionAssistantResponse,
  readSelectionAssistantConfig,
  SelectionAssistantEntry,
} from '../automation/selection-assistant';
import {
  getGlobalSelectedText,
  matchesHotkey,
  parseHotkey,
  registerGlobalKeydownListener,
} from '../automation/selection-shortcuts';

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

      const prompts = buildSelectionAssistantPrompts(config.promptFilePath, inputText);

      return generateSelectionAssistantResponse(config, prompts)
        .then((outputText) => createSelectionAssistantEntry(config, shortcut, inputText, outputText));
    })
};

export default fp(async function selectionAssistantPlugin(fastify: FastifyInstance) {
  const config = readSelectionAssistantConfig();
  const hotkey = parseHotkey(config.shortcut);
  const controller = createSelectionAssistantController(hotkey.shortcut, null);

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

        void appendSelectionAssistantOutput(config.logFilePath, entry.outputText).catch((err) => {
          fastify.log.error({ err, logFilePath: config.logFilePath }, 'Selection assistant could not write the local output log.');
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