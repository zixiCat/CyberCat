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
  status: SelectionAssistantEntry['status'],
  errorMessage?: string
): SelectionAssistantEntry => ({
  id: randomUUID(),
  createdAt: new Date().toISOString(),
  status,
  shortcut,
  inputText,
  outputText,
  errorMessage,
  model: config.model,
  promptFilePath: config.promptFilePath,
});

const runSelectionAssistantTask = async (
  config: ReturnType<typeof readSelectionAssistantConfig>,
  shortcut: string,
  fastify: FastifyInstance,
  pendingEntry: SelectionAssistantEntry
): Promise<SelectionAssistantEntry | null> => {
  const inputText = (await getGlobalSelectedText()).trim();

  if (!inputText) {
    fastify.log.warn('Selection assistant did not capture any selected text.');
    return null;
  }

  const prompts = buildSelectionAssistantPrompts(config.promptFilePath, inputText);
  const createUpdatedEntry = (
    outputText: string,
    status: SelectionAssistantEntry['status'],
    errorMessage?: string
  ): SelectionAssistantEntry => ({
    ...pendingEntry,
    inputText,
    outputText,
    status,
    errorMessage,
  });
  const outputText = await generateSelectionAssistantResponse(config, prompts, (streamedOutputText) => {
    fastify.selectionAssistant.publish(createUpdatedEntry(streamedOutputText, 'streaming'));
  });

  return createUpdatedEntry(outputText, 'complete');
};

const getErrorMessage = (error: unknown): string => error instanceof Error
  ? error.message
  : 'The selection assistant could not generate a response.';

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
    const pendingEntry = createSelectionAssistantEntry(config, hotkey.shortcut, '', '', 'loading');
    controller.publish(pendingEntry);

    void runSelectionAssistantTask(config, hotkey.shortcut, fastify, pendingEntry)
      .then((entry) => {
        if (!entry) {
          controller.publish({
            ...pendingEntry,
            status: 'error',
            errorMessage: 'No selected text was captured.',
          });
          return;
        }

        controller.publish(entry);

        void appendSelectionAssistantOutput(config.logFilePath, entry.outputText).catch((err) => {
          fastify.log.error({ err, logFilePath: config.logFilePath }, 'Selection assistant could not write the local output log.');
        });
      })
      .catch((err: unknown) => {
        fastify.log.error({ err }, 'Selection assistant could not generate a response.');
        controller.publish({
          ...pendingEntry,
          status: 'error',
          errorMessage: getErrorMessage(err),
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