import { useEffect, useRef } from 'react';
import { useSetState } from 'react-use';

import { loadBackendJson, waitForBackend } from '../backendShared';
import { AsrTestResult } from '../chatView/types';

const EMPTY_SIZE = 0;
const BACKEND_RETRY_DELAY_MS = 100;
const NEXT_TICK_DELAY_MS = 0;
const AUDIO_WAV_DATA_URL_PREFIX = 'data:audio/wav;base64,';

type RecordingSupportMode = 'browser' | 'backend' | 'backend-restart-required' | 'unavailable';

interface NativeRecordingResult {
  ok: boolean;
  audioBase64?: string;
  extension?: string;
  filename?: string;
  error?: string;
}

interface AsrTestState {
  asrLoading: boolean;
  asrResult: AsrTestResult | null;
  selectedAudioName: string;
  audioPayload: { base64: string; extension: string } | null;
  asrAudioSrc: string;
  recording: boolean;
  browserRecordingSupported: boolean;
  recordingSupportMode: RecordingSupportMode;
}

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

export const useAsrTest = () => {
  const [state, setState] = useSetState<AsrTestState>({
    asrLoading: false,
    asrResult: null,
    selectedAudioName: '',
    audioPayload: null,
    asrAudioSrc: '',
    recording: false,
    browserRecordingSupported: false,
    recordingSupportMode: 'unavailable',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
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

    const setupBackend = async () => {
      const backend = await waitForBackend({
        retryDelayMs: BACKEND_RETRY_DELAY_MS,
        isCancelled: () => cancelled,
      });

      if (!backend || cancelled) {
        return;
      }

      const backendSupportsRecording = Boolean(
        backend.start_asr_test_recording && backend.stop_asr_test_recording,
      );

      if (!browserSupported) {
        setState({
          recordingSupportMode: backendSupportsRecording ? 'backend' : 'backend-restart-required',
        });
      }
    };

    void setupBackend();

    return () => {
      cancelled = true;
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (nativeRecordingActiveRef.current && window.backend?.stop_asr_test_recording) {
        void window.backend.stop_asr_test_recording();
      }
    };
  }, [setState]);

  useEffect(() => {
    return () => {
      if (state.asrAudioSrc.startsWith('blob:')) {
        URL.revokeObjectURL(state.asrAudioSrc);
      }
    };
  }, [state.asrAudioSrc]);

  const handleAudioFile = async (file: File | Blob, fileName: string, extensionHint?: string) => {
    const nextBase64 = await fileToBase64(file);
    const nextExtension =
      extensionHint ||
      (fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined) ||
      'wav';

    if (state.asrAudioSrc.startsWith('blob:')) {
      URL.revokeObjectURL(state.asrAudioSrc);
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
    const { recordingSupportMode: mode, browserRecordingSupported: browserOk } = state;
    const backendRecordingSupported = mode === 'backend';

    if (mode === 'backend-restart-required') {
      setState({
        asrResult: {
          ok: false,
          error:
            'Recording support requires restarting the CyberCat desktop app so the updated backend can load.',
        },
      });
      return;
    }

    if (mode === 'unavailable') {
      setState({
        asrResult: {
          ok: false,
          error: 'Audio recording is not available in this runtime. Upload an audio file instead.',
        },
      });
      return;
    }

    if (!browserOk && backendRecordingSupported) {
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
    const backendRecordingSupported = state.recordingSupportMode === 'backend';

    if (!state.browserRecordingSupported && backendRecordingSupported) {
      try {
        const result = await loadBackendJson<NativeRecordingResult>(
          () => window.backend?.stop_asr_test_recording?.(),
          'Native recording stop',
        );
        if (!result.ok || !result.audioBase64) {
          throw new Error(result.error || 'Failed to process the recorded audio.');
        }

        if (state.asrAudioSrc.startsWith('blob:')) {
          URL.revokeObjectURL(state.asrAudioSrc);
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

  const handleRunAsr = async () => {
    const { audioPayload: payload } = state;
    if (!payload || !window.backend) {
      return;
    }

    setState({ asrLoading: true, asrResult: null });
    try {
      await waitForNextPaint();
      const result = await loadBackendJson<AsrTestResult>(
        () => window.backend?.transcribe_audio_base64?.(payload.base64, payload.extension),
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

  return {
    ...state,
    fileInputRef,
    handleFileSelection,
    startRecording,
    stopRecording,
    handleRunAsr,
  };
};
