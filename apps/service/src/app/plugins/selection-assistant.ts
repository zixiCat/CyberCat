import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { UiohookKeyboardEvent } from 'uiohook-napi';
import {
  appendSelectionAssistantOutput,
  buildSelectionAssistantPrompts,
  createSelectionAssistantController,
  generateSelectionAssistantResponse,
  readSelectionAssistantConfig,
} from '../automation/selection-assistant';
import { createSelectionAssistantRunner } from '../automation/selection-assistant/runner';
import {
  getGlobalSelectedText,
  matchesHotkey,
  parseHotkey,
  registerGlobalKeydownListener,
} from '../automation/selection-shortcuts';

export default fp(async function selectionAssistantPlugin(fastify: FastifyInstance) {
  const config = readSelectionAssistantConfig();
  const hotkey = parseHotkey(config.shortcut);
  const controller = createSelectionAssistantController(hotkey.shortcut, null);
  const run = createSelectionAssistantRunner({
    config,
    controller,
    readSelectedText: getGlobalSelectedText,
    generate: (inputText, onDelta) => generateSelectionAssistantResponse(
      config, buildSelectionAssistantPrompts(config.promptFilePath, inputText), onDelta
    ),
    appendOutput: (outputText) => appendSelectionAssistantOutput(config.logFilePaths, outputText),
    onError: (err) => fastify.log.error({ err }, 'Selection assistant task failed.'),
  });

  fastify.decorate('selectionAssistant', { ...controller, run });

  const onKeyDown = (event: UiohookKeyboardEvent): void => {
    if (!matchesHotkey(hotkey, event)) return;
    if (!run()) {
      fastify.log.warn('Selection assistant ignored a trigger while work was already in progress.');
    }
  };
  const stopListening = registerGlobalKeydownListener(onKeyDown);

  fastify.log.info(
    {
      logFilePaths: config.logFilePaths,
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
