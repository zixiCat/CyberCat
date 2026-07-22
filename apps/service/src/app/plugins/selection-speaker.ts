import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { UiohookKeyboardEvent } from 'uiohook-napi';
import {
  createAudioPlayback,
  deleteAudioFile,
  getGlobalSelectedText,
  matchesHotkey,
  parseHotkey,
  readSelectionSpeakerConfig,
  registerGlobalKeydownListener,
  synthesizeSpeech,
  splitSpeechText,
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

  let activeSession: { cancel: () => void } | null = null;
  let stopListening: (() => void) | null = null;

  const onKeyDown = async (event: UiohookKeyboardEvent): Promise<void> => {
    if (!matchesHotkey(hotkey, event)) {
      return;
    }

    activeSession?.cancel();

    const abortController = new AbortController();
    const playback = createAudioPlayback();
    const session = {
      cancel: () => {
        abortController.abort();
        playback.stop();
      },
    };
    activeSession = session;

    try {
      const selectedText = await getGlobalSelectedText();
      if (abortController.signal.aborted) {
        return;
      }

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

      const textSegments = splitSpeechText(textToSpeak);
      let nextSynthesis = synthesizeSpeech(
        config,
        textSegments[0],
        abortController.signal
      );

      for (let index = 0; index < textSegments.length; index += 1) {
        const audioBuffer = await nextSynthesis;
        if (abortController.signal.aborted) {
          return;
        }

        if (index + 1 < textSegments.length) {
          nextSynthesis = synthesizeSpeech(
            config,
            textSegments[index + 1],
            abortController.signal
          );
        }

        const audioFilePath = writeAudioToTempFile(audioBuffer);
        try {
          await playback.play(audioFilePath);
        } finally {
          await deleteAudioFile(audioFilePath);
        }
      }

    } catch (err) {
      if (!abortController.signal.aborted) {
        fastify.log.error({ err }, 'Selection speaker failed.');
      }
    } finally {
      playback.stop();

      if (activeSession === session) {
        activeSession = null;
      }
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
    activeSession?.cancel();
    activeSession = null;

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