import { useEffect, useRef } from 'react';
import { useSetState } from 'react-use';

import { loadBackendJson, parseBackendJson, waitForBackend } from '../backendShared';
import { BackendBridge, TtsTestResult, VoiceOption } from '../chatView/types';

const BACKEND_RETRY_DELAY_MS = 100;
const REQUEST_ID_RADIX = 36;
const REQUEST_ID_SLICE_START = 2;
const REQUEST_ID_SLICE_END = 10;
const NEXT_TICK_DELAY_MS = 0;
const AUDIO_WAV_DATA_URL_PREFIX = 'data:audio/wav;base64,';

interface TtsTestState {
  voiceOptions: VoiceOption[];
  selectedVoice: string;
  randomVoicePool: string[];
  ttsText: string;
  ttsLoading: boolean;
  ttsResult: TtsTestResult | null;
  ttsAudioSrc: string;
}

const createTtsTestRequestId = () =>
  `tts_test_${Date.now()}_${Math.random()
    .toString(REQUEST_ID_RADIX)
    .slice(REQUEST_ID_SLICE_START, REQUEST_ID_SLICE_END)}`;

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, NEXT_TICK_DELAY_MS);
    });
  });

const ensureSpeechLabSignalBindings = (backend: BackendBridge) => {
  if (window.cyberCatSpeechLabSignalsBound) {
    return;
  }

  window.cyberCatSpeechLabSignalsBound = true;

  backend.tts_test_started?.connect((requestId: string) => {
    window.cyberCatSpeechLabSignalHandlers?.onTtsTestStarted?.(requestId);
  });
  backend.tts_test_finished?.connect((requestId: string, resultJson: string) => {
    window.cyberCatSpeechLabSignalHandlers?.onTtsTestFinished?.(requestId, resultJson);
  });
};

export const useTtsTest = () => {
  const [state, setState] = useSetState<TtsTestState>({
    voiceOptions: [],
    selectedVoice: 'auto',
    randomVoicePool: [],
    ttsText: 'Hello from CyberCat. This is a speech lab test.',
    ttsLoading: false,
    ttsResult: null,
    ttsAudioSrc: '',
  });
  const activeTtsRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    window.cyberCatSpeechLabSignalHandlers = {
      ...window.cyberCatSpeechLabSignalHandlers,
      onTtsTestStarted: (requestId: string) => {
        if (activeTtsRequestIdRef.current === requestId) {
          setState({ ttsLoading: true });
        }
      },
      onTtsTestFinished: (requestId: string, resultJson: string) => {
        if (activeTtsRequestIdRef.current !== requestId) {
          return;
        }

        activeTtsRequestIdRef.current = null;

        try {
          const result = parseBackendJson<TtsTestResult>(resultJson, 'TTS test result');
          setState({
            ttsLoading: false,
            ttsResult: result,
            ttsAudioSrc:
              result.ok && result.audioBase64
                ? `${AUDIO_WAV_DATA_URL_PREFIX}${result.audioBase64}`
                : '',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to parse TTS test result.';
          setState({
            ttsLoading: false,
            ttsResult: { ok: false, error: message },
            ttsAudioSrc: '',
          });
        }
      },
    };

    const setupBackend = async () => {
      const backend = await waitForBackend({
        retryDelayMs: BACKEND_RETRY_DELAY_MS,
        isCancelled: () => cancelled,
      });

      if (!backend || cancelled) {
        return;
      }

      ensureSpeechLabSignalBindings(backend);

      const [voiceOptionsResult, activeVoiceResult, randomVoicePoolResult] = await Promise.allSettled([
        loadBackendJson<VoiceOption[]>(() => backend.get_voice_options?.(), 'Speech lab voice options'),
        loadBackendJson<{ voice: string }>(() => backend.get_active_voice?.(), 'Speech lab active voice'),
        loadBackendJson<string[]>(() => backend.get_random_voice_pool?.(), 'Speech lab random voice pool'),
      ]);

      if (cancelled) {
        return;
      }

      if (voiceOptionsResult.status === 'fulfilled') {
        setState({ voiceOptions: voiceOptionsResult.value });
      } else {
        console.error('Failed to load voice options:', voiceOptionsResult.reason);
      }

      if (activeVoiceResult.status === 'fulfilled') {
        if (activeVoiceResult.value.voice) {
          setState({ selectedVoice: activeVoiceResult.value.voice });
        }
      } else {
        console.error('Failed to load active voice:', activeVoiceResult.reason);
      }

      if (randomVoicePoolResult.status === 'fulfilled') {
        setState({ randomVoicePool: randomVoicePoolResult.value });
      } else {
        console.error('Failed to load random voice pool:', randomVoicePoolResult.reason);
      }
    };

    void setupBackend();

    return () => {
      cancelled = true;
      activeTtsRequestIdRef.current = null;
    };
  }, [setState]);

  useEffect(() => {
    return () => {
      if (state.ttsAudioSrc.startsWith('blob:')) {
        URL.revokeObjectURL(state.ttsAudioSrc);
      }
    };
  }, [state.ttsAudioSrc]);

  const handleRandomVoicePoolChange = (voices: string[]) => {
    setState({ randomVoicePool: voices });
    window.backend?.set_random_voice_pool?.(JSON.stringify(voices));
  };

  const handleRunTts = async () => {
    if (!state.ttsText.trim() || !window.backend || !window.backend.start_tts_test) {
      return;
    }

    const requestId = createTtsTestRequestId();
    activeTtsRequestIdRef.current = requestId;
    setState({ ttsLoading: true, ttsResult: null, ttsAudioSrc: '' });

    try {
      await waitForNextPaint();
      window.backend.start_tts_test(requestId, state.ttsText, state.selectedVoice);
    } catch (error) {
      activeTtsRequestIdRef.current = null;
      const message = error instanceof Error ? error.message : 'Failed to run TTS test.';
      setState({
        ttsLoading: false,
        ttsResult: { ok: false, error: message },
      });
    }
  };

  return {
    ...state,
    setState,
    handleRandomVoicePoolChange,
    handleRunTts,
  };
};
