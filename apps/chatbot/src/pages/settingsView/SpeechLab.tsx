import { Alert, Button, Input, Select } from 'antd';
import { LoaderCircle, Mic, Play, Square, Upload, Waves } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('auto');
  const [randomVoicePool, setRandomVoicePool] = useState<string[]>([]);
  const [ttsText, setTtsText] = useState('Hello from CyberCat. This is a speech lab test.');
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsResult, setTtsResult] = useState<TtsTestResult | null>(null);
  const [ttsAudioSrc, setTtsAudioSrc] = useState('');
  const [asrLoading, setAsrLoading] = useState(false);
  const [asrResult, setAsrResult] = useState<AsrTestResult | null>(null);
  const [selectedAudioName, setSelectedAudioName] = useState('');
  const [audioPayload, setAudioPayload] = useState<{ base64: string; extension: string } | null>(null);
  const [asrAudioSrc, setAsrAudioSrc] = useState('');
  const [recording, setRecording] = useState(false);
  const [browserRecordingSupported, setBrowserRecordingSupported] = useState(false);
  const [recordingSupportMode, setRecordingSupportMode] = useState<RecordingSupportMode>('unavailable');
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

    setBrowserRecordingSupported(browserSupported);
    setRecordingSupportMode(browserSupported ? 'browser' : 'unavailable');

    window.cyberCatSpeechLabSignalHandlers = {
      onTtsTestStarted: (requestId: string) => {
        if (activeTtsRequestIdRef.current === requestId) {
          setTtsLoading(true);
        }
      },
      onTtsTestFinished: (requestId: string, resultJson: string) => {
        if (activeTtsRequestIdRef.current !== requestId) {
          return;
        }

        activeTtsRequestIdRef.current = null;

        try {
          const result = JSON.parse(resultJson) as TtsTestResult;
          setTtsResult(result);
          if (result.ok && result.audioBase64) {
            setTtsAudioSrc(`data:audio/wav;base64,${result.audioBase64}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to parse TTS test result.';
          setTtsResult({ ok: false, error: message });
        } finally {
          setTtsLoading(false);
        }
      },
    };

    const setupBackend = () => {
      if (cancelled) {
        return;
      }

      if (!window.backend) {
        window.setTimeout(setupBackend, BACKEND_RETRY_DELAY_MS);
        return;
      }

      const backendSupportsRecording = Boolean(
        window.backend.start_asr_test_recording && window.backend.stop_asr_test_recording,
      );

      if (browserSupported) {
        setRecordingSupportMode('browser');
      } else if (backendSupportsRecording) {
        setRecordingSupportMode('backend');
      } else {
        setRecordingSupportMode('backend-restart-required');
      }

      ensureSpeechLabSignalBindings(window.backend);

      window.backend.get_voice_options().then((voiceOptionsJson: string) => {
        try {
          setVoiceOptions(JSON.parse(voiceOptionsJson) as VoiceOption[]);
        } catch (error) {
          console.error('Failed to load voice options:', error);
        }
      });

      window.backend.get_active_voice().then((voice: string) => {
        if (voice) {
          setSelectedVoice(voice);
        }
      });

      window.backend.get_random_voice_pool().then((voicesJson: string) => {
        try {
          setRandomVoicePool(JSON.parse(voicesJson) as string[]);
        } catch (error) {
          console.error('Failed to load random voice pool:', error);
        }
      });
    };

    setupBackend();

    return () => {
      cancelled = true;
      activeTtsRequestIdRef.current = null;
      window.cyberCatSpeechLabSignalHandlers = {};
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (nativeRecordingActiveRef.current && window.backend?.stop_asr_test_recording) {
        void window.backend.stop_asr_test_recording();
      }
    };
  }, []);

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
    setRandomVoicePool(voices);
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

    setSelectedAudioName(fileName);
    setAudioPayload({ base64: nextBase64, extension: nextExtension });
    setAsrAudioSrc(URL.createObjectURL(file));
    setAsrResult(null);
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
      setAsrResult({ ok: false, error: 'Failed to read the selected audio file.' });
    } finally {
      event.target.value = '';
    }
  };

  const startRecording = async () => {
    if (recordingSupportMode === 'backend-restart-required') {
      setAsrResult({
        ok: false,
        error: 'Recording support requires restarting the CyberCat desktop app so the updated backend can load.',
      });
      return;
    }

    if (recordingSupportMode === 'unavailable') {
      setAsrResult({
        ok: false,
        error: 'Audio recording is not available in this runtime. Upload an audio file instead.',
      });
      return;
    }

    if (!browserRecordingSupported && backendRecordingSupported) {
      try {
        const resultJson = await window.backend?.start_asr_test_recording?.();
        if (!resultJson) {
          throw new Error('Recording backend is not ready.');
        }

        const result = JSON.parse(resultJson) as NativeRecordingResult;
        if (!result.ok) {
          throw new Error(result.error || 'Microphone access was denied or unavailable.');
        }

        nativeRecordingActiveRef.current = true;
        setRecording(true);
        setAsrResult(null);
      } catch (error) {
        console.error('Unable to start native recording:', error);
        const message =
          error instanceof Error ? error.message : 'Microphone access was denied or unavailable.';
        setAsrResult({ ok: false, error: message });
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
        setRecording(false);

        try {
          await handleAudioFile(blob, `recording.${extension}`, extension);
        } catch (error) {
          console.error('Failed to process recording:', error);
          setAsrResult({ ok: false, error: 'Failed to process the recorded audio.' });
        }
      };
      mediaRecorder.start();
      setRecording(true);
      setAsrResult(null);
    } catch (error) {
      console.error('Unable to start recording:', error);
      setAsrResult({ ok: false, error: 'Microphone access was denied or unavailable.' });
    }
  };

  const stopRecording = async () => {
    if (!browserRecordingSupported && backendRecordingSupported) {
      try {
        const resultJson = await window.backend?.stop_asr_test_recording?.();
        if (!resultJson) {
          throw new Error('Recording backend is not ready.');
        }

        const result = JSON.parse(resultJson) as NativeRecordingResult;
        if (!result.ok || !result.audioBase64) {
          throw new Error(result.error || 'Failed to process the recorded audio.');
        }

        if (asrAudioSrc.startsWith('blob:')) {
          URL.revokeObjectURL(asrAudioSrc);
        }

        const extension = result.extension || 'wav';
        const filename = result.filename || `recording.${extension}`;
        setSelectedAudioName(filename);
        setAudioPayload({ base64: result.audioBase64, extension });
        setAsrAudioSrc(`${AUDIO_WAV_DATA_URL_PREFIX}${result.audioBase64}`);
        setAsrResult(null);
      } catch (error) {
        console.error('Failed to stop native recording:', error);
        const message = error instanceof Error ? error.message : 'Failed to process the recorded audio.';
        setAsrResult({ ok: false, error: message });
      } finally {
        nativeRecordingActiveRef.current = false;
        setRecording(false);
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
    setTtsLoading(true);
    setTtsResult(null);
    setTtsAudioSrc('');

    try {
      await waitForNextPaint();
      window.backend.start_tts_test(requestId, ttsText, selectedVoice);
    } catch (error) {
      activeTtsRequestIdRef.current = null;
      const message = error instanceof Error ? error.message : 'Failed to run TTS test.';
      setTtsResult({ ok: false, error: message });
      setTtsLoading(false);
    }
  };

  const handleRunAsr = async () => {
    if (!audioPayload || !window.backend) {
      return;
    }

    setAsrLoading(true);
    setAsrResult(null);
    try {
      await waitForNextPaint();
      const resultJson = await window.backend.transcribe_audio_base64(
        audioPayload.base64,
        audioPayload.extension,
      );
      setAsrResult(JSON.parse(resultJson) as AsrTestResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run ASR test.';
      setAsrResult({ ok: false, error: message });
    } finally {
      setAsrLoading(false);
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
            onChange={(event) => setTtsText(event.target.value)}
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
                onChange={setSelectedVoice}
                options={voiceOptions.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
              />
            </div>

            {selectedVoice === 'auto' && (
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
                />
              </div>
            )}
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
            {selectedVoice === 'auto' && (
              <Button
                type="text"
                size="small"
                onClick={() =>
                  handleRandomVoicePoolChange(randomVoiceOptions.map((option) => option.value))
                }
                className="rounded-lg!"
              >
                Use all voices
              </Button>
            )}
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