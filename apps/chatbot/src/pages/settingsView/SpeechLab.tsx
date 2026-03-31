import { Alert, Button, Input, Select } from 'antd';
import { LoaderCircle, Mic, Play, Square, Upload, Waves } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useSetState } from 'react-use';

import { loadBackendJson, parseBackendJson, waitForBackend } from '../backendShared';
import { AsrTestResult, BackendBridge, TtsTestResult, VoiceOption } from '../chatView/types';

const EMPTY_SIZE = 0;
const NEXT_TICK_DELAY_MS = 0;
const BACKEND_RETRY_DELAY_MS = 100;
const REQUEST_ID_RADIX = 36;
const REQUEST_ID_SLICE_START = 2;
const REQUEST_ID_SLICE_END = 10;
const AUDIO_WAV_DATA_URL_PREFIX = 'data:audio/wav;base64,';

type RecordingSupportMode = 'browser' | 'backend' | 'backend-restart-required' | 'unavailable';

interface NativeRecordingResult {
  ok: boolean;
  audioBase64?: string;
  extension?: string;
  filename?: string;
  error?: string;
}

interface SpeechLabState {
  voiceOptions: VoiceOption[];
  selectedVoice: string;
  randomVoicePool: string[];
  ttsText: string;
  ttsLoading: boolean;
  ttsResult: TtsTestResult | null;
  ttsAudioSrc: string;
  asrLoading: boolean;
  asrResult: AsrTestResult | null;
  selectedAudioName: string;
  audioPayload: { base64: string; extension: string } | null;
  asrAudioSrc: string;
  recording: boolean;
  browserRecordingSupported: boolean;
  recordingSupportMode: RecordingSupportMode;
}

const createTtsTestRequestId = () =>
  `tts_test_${Date.now()}_${Math.random()
    .toString(REQUEST_ID_RADIX)
    .slice(REQUEST_ID_SLICE_START, REQUEST_ID_SLICE_END)}`;

const fileToBase64 = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unable to read audio file.'));
        return;
      }
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read audio file.'));
    reader.readAsDataURL(file);
  });

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

export const SpeechLab = () => {
  const [state, setState] = useSetState<SpeechLabState>({
    voiceOptions: [],
    selectedVoice: 'auto',
    randomVoicePool: [],
    ttsText: 'Hello from CyberCat. This is a speech lab test.',
    ttsLoading: false,
    ttsResult: null,
    ttsAudioSrc: '',
    asrLoading: false,
    asrResult: null,
    selectedAudioName: '',
    audioPayload: null,
    asrAudioSrc: '',
    recording: false,
    browserRecordingSupported: false,
    recordingSupportMode: 'unavailable',
  });
  const {
    voiceOptions,
    selectedVoice,
    randomVoicePool,
    ttsText,
    ttsLoading,
    ttsResult,
    ttsAudioSrc,
    asrLoading,
    asrResult,
    selectedAudioName,
    audioPayload,
    asrAudioSrc,
    recording,
    browserRecordingSupported,
    recordingSupportMode,
  } = state;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const activeTtsRequestIdRef = useRef<string | null>(null);
  const nativeRecordingActiveRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const browserSupported =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== 'undefined';

    setState({
      browserRecordingSupported: browserSupported,
      recordingSupportMode: browserSupported ? 'browser' : 'unavailable',
    });

    window.cyberCatSpeechLabSignalHandlers = {
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

      if (!backend) {
        return;
      }

      const backendSupportsRecording = Boolean(
        backend.start_asr_test_recording && backend.stop_asr_test_recording,
      );

      setState({
        recordingSupportMode: browserSupported
          ? 'browser'
          : backendSupportsRecording
            ? 'backend'
            : 'backend-restart-required',
      });

      ensureSpeechLabSignalBindings(backend);

      const [voiceOptionsResult, activeVoiceResult, randomVoicePoolResult] = await Promise.allSettled([
        loadBackendJson<VoiceOption[]>(() => backend.get_voice_options?.(), 'Speech lab voice options'),
        backend.get_active_voice ? backend.get_active_voice() : Promise.resolve(''),
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
        if (activeVoiceResult.value) {
          setState({ selectedVoice: activeVoiceResult.value });
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
      window.cyberCatSpeechLabSignalHandlers = {};
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (nativeRecordingActiveRef.current && window.backend?.stop_asr_test_recording) {
        void window.backend.stop_asr_test_recording();
      }
    };
  }, [setState]);

  useEffect(() => {
    return () => {
      if (ttsAudioSrc.startsWith('blob:')) {
        URL.revokeObjectURL(ttsAudioSrc);
      }
    };
  }, [ttsAudioSrc]);

  useEffect(() => {
    return () => {
      if (asrAudioSrc.startsWith('blob:')) {
        URL.revokeObjectURL(asrAudioSrc);
      }
    };
  }, [asrAudioSrc]);

  const randomVoiceOptions = useMemo(
    () => voiceOptions.filter((option) => option.value !== 'auto'),
    [voiceOptions],
  );
  const activeModel = useMemo(
    () => randomVoiceOptions[0]?.model || 'qwen-tts-latest',
    [randomVoiceOptions],
  );
  const supportedVoiceNames = useMemo(
    () => randomVoiceOptions.map((option) => option.label),
    [randomVoiceOptions],
  );

  const backendRecordingSupported = recordingSupportMode === 'backend';

  const handleRandomVoicePoolChange = (voices: string[]) => {
    setState({ randomVoicePool: voices });
    window.backend?.set_random_voice_pool(JSON.stringify(voices));
  };

  const handleAudioFile = async (file: File | Blob, fileName: string, extensionHint?: string) => {
    const nextBase64 = await fileToBase64(file);
    const nextExtension =
      extensionHint ||
      (fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined) ||
      'wav';

    if (asrAudioSrc.startsWith('blob:')) {
      URL.revokeObjectURL(asrAudioSrc);
    }

    setState({
      selectedAudioName: fileName,
      audioPayload: { base64: nextBase64, extension: nextExtension },
      asrAudioSrc: URL.createObjectURL(file),
      asrResult: null,
    });
  };

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      await handleAudioFile(file, file.name);
    } catch (error) {
      console.error('Failed to load audio file:', error);
      setState({ asrResult: { ok: false, error: 'Failed to read the selected audio file.' } });
    } finally {
      event.target.value = '';
    }
  };

  const startRecording = async () => {
    if (recordingSupportMode === 'backend-restart-required') {
      setState({
        asrResult: {
          ok: false,
          error:
            'Recording support requires restarting the CyberCat desktop app so the updated backend can load.',
        },
      });
      return;
    }

    if (recordingSupportMode === 'unavailable') {
      setState({
        asrResult: {
          ok: false,
          error: 'Audio recording is not available in this runtime. Upload an audio file instead.',
        },
      });
      return;
    }

    if (!browserRecordingSupported && backendRecordingSupported) {
      try {
        const result = await loadBackendJson<NativeRecordingResult>(
          () => window.backend?.start_asr_test_recording?.(),
          'Native recording start',
        );
        if (!result.ok) {
          throw new Error(result.error || 'Microphone access was denied or unavailable.');
        }

        nativeRecordingActiveRef.current = true;
        setState({ recording: true, asrResult: null });
      } catch (error) {
        console.error('Unable to start native recording:', error);
        const message =
          error instanceof Error ? error.message : 'Microphone access was denied or unavailable.';
        setState({ asrResult: { ok: false, error: message } });
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > EMPTY_SIZE) {
          recordedChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = async () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setState({ recording: false });

        try {
          await handleAudioFile(blob, `recording.${extension}`, extension);
        } catch (error) {
          console.error('Failed to process recording:', error);
          setState({ asrResult: { ok: false, error: 'Failed to process the recorded audio.' } });
        }
      };
      mediaRecorder.start();
      setState({ recording: true, asrResult: null });
    } catch (error) {
      console.error('Unable to start recording:', error);
      setState({
        asrResult: { ok: false, error: 'Microphone access was denied or unavailable.' },
      });
    }
  };

  const stopRecording = async () => {
    if (!browserRecordingSupported && backendRecordingSupported) {
      try {
        const result = await loadBackendJson<NativeRecordingResult>(
          () => window.backend?.stop_asr_test_recording?.(),
          'Native recording stop',
        );
        if (!result.ok || !result.audioBase64) {
          throw new Error(result.error || 'Failed to process the recorded audio.');
        }

        if (asrAudioSrc.startsWith('blob:')) {
          URL.revokeObjectURL(asrAudioSrc);
        }

        const extension = result.extension || 'wav';
        const filename = result.filename || `recording.${extension}`;
        setState({
          selectedAudioName: filename,
          audioPayload: { base64: result.audioBase64, extension },
          asrAudioSrc: `${AUDIO_WAV_DATA_URL_PREFIX}${result.audioBase64}`,
          asrResult: null,
        });
      } catch (error) {
        console.error('Failed to stop native recording:', error);
        const message = error instanceof Error ? error.message : 'Failed to process the recorded audio.';
        setState({ asrResult: { ok: false, error: message } });
      } finally {
        nativeRecordingActiveRef.current = false;
        setState({ recording: false });
      }
      return;
    }

    mediaRecorderRef.current?.stop();
  };

  const handleRunTts = async () => {
    if (!ttsText.trim() || !window.backend || !window.backend.start_tts_test) {
      return;
    }

    const requestId = createTtsTestRequestId();
    activeTtsRequestIdRef.current = requestId;
    setState({ ttsLoading: true, ttsResult: null, ttsAudioSrc: '' });

    try {
      await waitForNextPaint();
      window.backend.start_tts_test(requestId, ttsText, selectedVoice);
    } catch (error) {
      activeTtsRequestIdRef.current = null;
      const message = error instanceof Error ? error.message : 'Failed to run TTS test.';
      setState({
        ttsLoading: false,
        ttsResult: { ok: false, error: message },
      });
    }
  };

  const handleRunAsr = async () => {
    if (!audioPayload || !window.backend) {
      return;
    }

    setState({ asrLoading: true, asrResult: null });
    try {
      await waitForNextPaint();
      const result = await loadBackendJson<AsrTestResult>(
        () => window.backend?.transcribe_audio_base64?.(audioPayload.base64, audioPayload.extension),
        'ASR test',
      );
      setState({ asrResult: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run ASR test.';
      setState({ asrResult: { ok: false, error: message } });
    } finally {
      setState({ asrLoading: false });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="cybercat-panel p-5">
        <div className="flex items-center gap-2">
          <div className="
            cybercat-icon-tile size-8 text-violet-600

            dark:text-violet-300
          ">
            <Waves size={16} />
          </div>
          <div>
            <h3 className="
              text-sm font-semibold text-zinc-900

              dark:text-zinc-100
            ">TTS Test</h3>
            <p className="
              text-xs text-zinc-500

              dark:text-zinc-400
            ">
              Preview voice output before using it in chat.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          <Alert
            type="info"
            showIcon
            message={
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span>Active model:</span>
                  <span className="cybercat-inline-badge">{activeModel}</span>
                </div>
                <div className="text-xs/5 text-current/80">
                  Supported voices in this model: {supportedVoiceNames.join(', ') || 'Loading...'}
                </div>
              </div>
            }
          />

          <Input.TextArea
            value={ttsText}
            onChange={(event) => setState({ ttsText: event.target.value })}
            rows={4}
            placeholder="Enter text to synthesize"
          />

          <div className="
            flex flex-col gap-3

            md:flex-row md:items-start
          ">
            <div className="flex-1">
              <label className="
                mb-2 block text-sm font-medium text-zinc-500

                dark:text-zinc-400
              ">
                Voice
              </label>
              <Select
                className="w-full"
                value={selectedVoice}
                onChange={(value) => setState({ selectedVoice: value })}
                options={voiceOptions.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
              />
            </div>

            <div className="flex-1">
              <label className="
                mb-2 block text-sm font-medium text-zinc-500

                dark:text-zinc-400
              ">
                Random voice pool
              </label>
              <Select
                mode="multiple"
                className="w-full"
                value={randomVoicePool}
                onChange={(voices) => handleRandomVoicePoolChange(voices)}
                options={randomVoiceOptions.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                placeholder="Empty = all voices"
                disabled={selectedVoice !== 'auto'}
              />
              <div className="
                mt-2 text-xs/5 text-zinc-500

                dark:text-zinc-400
              ">
                Switch the voice selector to Auto to use the random voice pool.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              icon={<Play size={14} />}
              loading={ttsLoading}
              onClick={handleRunTts}
              disabled={ttsLoading || !ttsText.trim()}
              className="cybercat-gradient-button rounded-lg! border-none! shadow-none!"
            >
              {ttsLoading ? 'Running TTS...' : 'Run TTS'}
            </Button>
            <Button
              type="text"
              size="small"
              onClick={() =>
                handleRandomVoicePoolChange(randomVoiceOptions.map((option) => option.value))
              }
              className="rounded-lg!"
              disabled={selectedVoice !== 'auto'}
            >
              Use all voices
            </Button>
          </div>

          {ttsLoading && (
            <div
              aria-live="polite"
              className="
                flex items-start gap-3 rounded-xl border border-blue-200/80 bg-blue-50 px-4 py-3
                text-sm text-blue-900

                dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-100
              "
            >
              <LoaderCircle size={16} className="mt-0.5 shrink-0 animate-spin" />
              <div>
                <div className="font-medium">Synthesizing speech...</div>
                <div className="
                  text-xs text-blue-800/80

                  dark:text-blue-100/70
                ">
                  The audio preview will appear here when the TTS request finishes.
                </div>
              </div>
            </div>
          )}

          {ttsResult && (
            <Alert
              type={ttsResult.ok ? 'success' : 'error'}
              showIcon
              message={
                ttsResult.ok ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Resolved voice:</span>
                    <span className="
                      cybercat-inline-badge text-violet-600

                      dark:text-violet-300
                    ">
                      {ttsResult.voice}
                    </span>
                    <span className="cybercat-inline-badge">{ttsResult.model}</span>
                  </div>
                ) : (
                  ttsResult.error
                )
              }
            />
          )}

          {ttsAudioSrc && ttsResult?.ok && <audio controls className="w-full" src={ttsAudioSrc} />}
        </div>
      </section>

      <section className="cybercat-panel p-5">
        <div className="flex items-center gap-2">
          <div className="
            cybercat-icon-tile size-8 text-emerald-500

            dark:text-emerald-300
          ">
            <Upload size={16} />
          </div>
          <div>
            <h3 className="
              text-sm font-semibold text-zinc-900

              dark:text-zinc-100
            ">ASR Test</h3>
            <p className="
              text-xs text-zinc-500

              dark:text-zinc-400
            ">
              Upload or record audio and verify transcription quality.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelection}
              className="hidden"
            />
            <Button
              icon={<Upload size={14} />}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg! shadow-none!"
            >
              Upload Audio
            </Button>
            <Button
              icon={recording ? <Square size={14} /> : <Mic size={14} />}
              onClick={recording ? stopRecording : startRecording}
              danger={recording}
              className={recording ? 'rounded-lg! shadow-none!' : 'rounded-lg! shadow-none!'}
            >
              {recording ? 'Stop Recording' : 'Record Audio'}
            </Button>
            {selectedAudioName && <span className="cybercat-inline-badge">{selectedAudioName}</span>}
          </div>

          {recordingSupportMode === 'backend-restart-required' && (
            <Alert
              type="warning"
              showIcon
              message="Recording support was added, but this desktop window is still using the old backend. Restart CyberCat and try again."
            />
          )}

          {recordingSupportMode === 'unavailable' && (
            <Alert
              type="info"
              showIcon
              message="Browser recording is not available here. Upload an audio file instead."
            />
          )}

          {asrAudioSrc && audioPayload && <audio controls className="w-full" src={asrAudioSrc} />}

          <Button
            loading={asrLoading}
            onClick={handleRunAsr}
            disabled={!audioPayload}
            className="cybercat-gradient-button w-fit! rounded-lg! border-none! shadow-none!"
          >
            Run ASR
          </Button>

          <Input.TextArea
            rows={5}
            readOnly
            value={asrResult?.ok ? asrResult.text : asrResult?.error || ''}
            placeholder="Transcription result will appear here"
            status={asrResult && !asrResult.ok ? 'error' : undefined}
          />
        </div>
      </section>
    </div>
  );
};