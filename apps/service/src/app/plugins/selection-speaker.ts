import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { UiohookKeyboardEvent } from 'uiohook-napi';
import {
  deleteAudioFile,
  getGlobalSelectedText,
  matchesHotkey,
  parseHotkey,
  playAudioFile,
  readSelectionSpeakerConfig,
  registerGlobalKeydownListener,
  synthesizeSpeech,
  writeAudioToTempFile,
} from '../automation/selection-speaker';

const trimSelectedText = (value: string, maxInputLength: number): string => {
  const normalizedText = value.trim();

  if (normalizedText.length <= maxInputLength) {
    return normalizedText;
  }

  return normalizedText.slice(0, maxInputLength).trimEnd();
};

export default fp(async function selectionSpeakerPlugin(fastify: FastifyInstance) {
  const config = readSelectionSpeakerConfig();

  if (process.platform !== 'win32') {
    fastify.log.warn('Selection speaker is only supported on Windows.');
    return;
  }

  if (!config.apiKey) {
    fastify.log.warn(
      'Selection speaker is enabled but no OpenAI-compatible API key was configured through SELECTION_SPEAKER_API_KEY.'
    );
    return;
  }

  let hotkey;

  try {
    hotkey = parseHotkey(config.shortcut);
  } catch (err) {
    fastify.log.error({ err, shortcut: config.shortcut }, 'Selection speaker shortcut is invalid.');
    return;
  }

  let isRunning = false;
  let stopListening: (() => void) | null = null;

  const onKeyDown = async (event: UiohookKeyboardEvent): Promise<void> => {
    if (!matchesHotkey(hotkey, event)) {
      return;
    }

    if (isRunning) {
      fastify.log.warn('Selection speaker ignored a trigger while work was already in progress.');
      return;
    }

    isRunning = true;
    let audioFilePath = '';

    try {
      const selectedText = await getGlobalSelectedText();
      const textToSpeak = trimSelectedText(selectedText, config.maxInputLength);

      if (!textToSpeak) {
        fastify.log.warn('Selection speaker did not capture any selected text.');
        return;
      }

      if (textToSpeak.length < selectedText.trim().length) {
        fastify.log.info(
          {
            originalLength: selectedText.trim().length,
            truncatedLength: textToSpeak.length,
          },
          'Selection speaker truncated the captured text to the configured maximum length.'
        );
      }

      const audioBuffer = await synthesizeSpeech(config, textToSpeak);
      audioFilePath = await writeAudioToTempFile(audioBuffer);

      await playAudioFile(audioFilePath);
    } catch (err) {
      fastify.log.error({ err }, 'Selection speaker failed.');
    } finally {
      if (audioFilePath) {
        await deleteAudioFile(audioFilePath);
      }

      isRunning = false;
    }
  };

  try {
    stopListening = registerGlobalKeydownListener(onKeyDown);
  } catch (err) {
    fastify.log.error({ err }, 'Selection speaker could not start the global keyboard hook.');
    return;
  }

  fastify.log.info(
    {
      model: config.model,
      shortcut: hotkey.shortcut,
      voice: config.voice,
    },
    'Selection speaker started.'
  );

  fastify.addHook('onClose', async () => {
    if (!stopListening) {
      return;
    }

    try {
      stopListening();
    } catch {
      fastify.log.warn('Selection speaker could not stop the global keyboard hook cleanly.');
    } finally {
      stopListening = null;
    }
  });
});