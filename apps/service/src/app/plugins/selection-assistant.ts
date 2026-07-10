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
  type SelectionAssistantRuntimeState,
  type SelectionAssistantStatus,
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

const trimSelectedText = (value: string, maxInputLength: number): string => {
  const normalizedText = value.trim();

  if (normalizedText.length <= maxInputLength) {
    return normalizedText;
  }

  return normalizedText.slice(0, maxInputLength).trimEnd();
};

const createStatus = (
  state: SelectionAssistantRuntimeState,
  config: ReturnType<typeof readSelectionAssistantConfig>,
  message: string
): SelectionAssistantStatus => ({
  state,
  message,
  shortcut: config.shortcut,
  model: config.model,
  promptFilePath: config.promptFilePath,
  logFilePath: config.logFilePath,
});

const persistLogEntry = async (
  entry: Omit<SelectionAssistantEntry, 'logSaved' | 'logErrorMessage'>,
  logFilePath: string,
  fastify: FastifyInstance
): Promise<SelectionAssistantEntry> => {
  try {
    const persistedEntry: SelectionAssistantEntry = {
      ...entry,
      logSaved: true,
    };

    await appendSelectionAssistantLog(logFilePath, persistedEntry);

    return persistedEntry;
  } catch (err) {
    fastify.log.error({ err, logFilePath }, 'Selection assistant could not write the local log entry.');

    return {
      ...entry,
      logSaved: false,
      logErrorMessage: err instanceof Error ? err.message : 'Unknown log write failure.',
    };
  }
};

export default fp(async function selectionAssistantPlugin(fastify: FastifyInstance) {
  const config = readSelectionAssistantConfig();
  const initialEntry = await readSelectionAssistantLatestLogEntry(config.logFilePath);
  const controller = createSelectionAssistantController(
    createStatus(
      config.enabled ? 'idle' : 'disabled',
      config,
      config.enabled ? `Ready. Press ${config.shortcut} after selecting text.` : 'Selection assistant is disabled.'
    ),
    initialEntry
  );

  fastify.decorate('selectionAssistant', controller);

  if (!config.enabled) {
    return;
  }

  if (process.platform !== 'win32') {
    controller.setStatus(createStatus('unsupported', config, 'Selection assistant is only supported on Windows.'));
    fastify.log.warn('Selection assistant is only supported on Windows.');
    return;
  }

  if (!config.apiKey) {
    controller.setStatus(
      createStatus(
        'misconfigured',
        config,
        'Selection assistant is enabled but no API key was configured through SELECTION_ASSISTANT_API_KEY or OPENAI_API_KEY.'
      )
    );
    fastify.log.warn(
      'Selection assistant is enabled but no API key was configured through SELECTION_ASSISTANT_API_KEY or OPENAI_API_KEY.'
    );
    return;
  }

  let hotkey;

  try {
    hotkey = parseHotkey(config.shortcut);
  } catch (err) {
    controller.setStatus(createStatus('misconfigured', config, 'Selection assistant shortcut is invalid.'));
    fastify.log.error({ err, shortcut: config.shortcut }, 'Selection assistant shortcut is invalid.');
    return;
  }

  let isRunning = false;
  let stopListening: (() => void) | null = null;

  const onKeyDown = async (event: UiohookKeyboardEvent): Promise<void> => {
    if (!matchesHotkey(hotkey, event)) {
      return;
    }

    if (isRunning) {
      fastify.log.warn('Selection assistant ignored a trigger while work was already in progress.');
      return;
    }

    isRunning = true;
    controller.setStatus(createStatus('busy', config, 'Processing the current selection...'));
    let inputText = '';

    try {
      const selectedText = await getGlobalSelectedText();
      inputText = trimSelectedText(selectedText, config.maxInputLength);

      if (!inputText) {
        controller.setStatus(createStatus('idle', config, 'No selected text was captured. Select text and try again.'));
        fastify.log.warn('Selection assistant did not capture any selected text.');
        return;
      }

      if (inputText.length < selectedText.trim().length) {
        fastify.log.info(
          {
            originalLength: selectedText.trim().length,
            truncatedLength: inputText.length,
          },
          'Selection assistant truncated the captured text to the configured maximum length.'
        );
      }

      const prompts = await buildSelectionAssistantPrompts(config.promptFilePath, inputText);
      const outputText = await generateSelectionAssistantResponse(config, prompts);
      const entry = await persistLogEntry(
        {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          status: 'success',
          shortcut: hotkey.shortcut,
          inputText,
          outputText,
          model: config.model,
          promptFilePath: config.promptFilePath,
          logFilePath: config.logFilePath,
        },
        config.logFilePath,
        fastify
      );

      controller.publish(entry);
      controller.setStatus(createStatus('idle', config, `Ready. Press ${hotkey.shortcut} after selecting text.`));
    } catch (err) {
      const entry = await persistLogEntry(
        {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          status: 'error',
          shortcut: hotkey.shortcut,
          inputText,
          outputText: '',
          errorMessage: err instanceof Error ? err.message : 'Selection assistant failed.',
          model: config.model,
          promptFilePath: config.promptFilePath,
          logFilePath: config.logFilePath,
        },
        config.logFilePath,
        fastify
      );

      controller.publish(entry);
      controller.setStatus(createStatus('idle', config, `Ready. Press ${hotkey.shortcut} after selecting text.`));
      fastify.log.error({ err }, 'Selection assistant failed.');
    } finally {
      isRunning = false;
    }
  };

  try {
    stopListening = registerGlobalKeydownListener(onKeyDown);
  } catch (err) {
    controller.setStatus(createStatus('misconfigured', config, 'Selection assistant could not start the global keyboard hook.'));
    fastify.log.error({ err }, 'Selection assistant could not start the global keyboard hook.');
    return;
  }

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
    if (!stopListening) {
      return;
    }

    stopListening();
    stopListening = null;
  });
});