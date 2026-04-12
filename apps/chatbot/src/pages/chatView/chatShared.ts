import { Session } from './types';

export const AUDIO_SAMPLE_RATE = 24000;
export const AUDIO_CHANNELS = 1;
export const AUDIO_CHANNEL_INDEX = 0;
export const EMPTY_LENGTH = 0;
export const PCM_MAX = 32768.0;
export const RETRY_DELAY_MS = 100;
export const SEGMENT_TASK_DIVISOR = 10000;
export const SESSION_SAVE_DELAY_MS = 250;
export const MESSAGE_INPUT_ID = 'chat-message-input';
export const THINKING_FIELD_KEY = 'openai_enable_thinking';

export const isThinkingSupportedForModel = (modelName: string) =>
  modelName.trim().toLowerCase().includes('qwen');

export const parseStoredVoicePool = (rawValue: string | boolean | undefined) =>
  typeof rawValue === 'string'
    ? rawValue
        .split(',')
        .map((voice) => voice.trim())
        .filter(Boolean)
    : [];

export const ensureBackendSignalBindings = (backend: NonNullable<Window['backend']>) => {
  if (window.cyberCatBackendSignalsBound) {
    return;
  }

  window.cyberCatBackendSignalsBound = true;

  backend.task_started?.connect((taskId: number, prompt: string) => {
    window.cyberCatBackendSignalHandlers?.onTaskStarted?.(taskId, prompt);
  });
  backend.task_log?.connect((taskId: number, source: string, message: string) => {
    window.cyberCatBackendSignalHandlers?.onTaskLogEntry?.(taskId, source, message);
  });
  backend.segment_text_chunk?.connect((segmentId: number, chunk: string) => {
    window.cyberCatBackendSignalHandlers?.onSegmentTextChunk?.(segmentId, chunk);
  });
  backend.segment_audio_chunk?.connect((segmentId: number, audioBase64: string) => {
    window.cyberCatBackendSignalHandlers?.onSegmentAudioChunk?.(segmentId, audioBase64);
  });
  backend.segment_finished?.connect((segmentId: number) => {
    window.cyberCatBackendSignalHandlers?.onSegmentFinished?.(segmentId);
  });
  backend.task_finished?.connect(() => {
    window.cyberCatBackendSignalHandlers?.onTaskFinished?.();
  });
  backend.file_ingest_started?.connect((payloadJson: string) => {
    window.cyberCatBackendSignalHandlers?.onFileIngestStarted?.(payloadJson);
  });
  backend.file_ingest_finished?.connect((payloadJson: string) => {
    window.cyberCatBackendSignalHandlers?.onFileIngestFinished?.(payloadJson);
  });
  backend.window_state_changed?.connect((maximized: boolean) => {
    window.cyberCatBackendSignalHandlers?.onWindowStateChanged?.(maximized);
  });
};

export const formatTimestamp = (date: Date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y} ${m} ${d} ${h}:${min}:${s}`;
};

export const generateSessionId = () => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return `chatbot_${y}${m}${d}_${h}${min}${s}_${random}`;
};

export const stripTransientSessionData = (session: Session) => ({
  ...session,
  tasks: (session.tasks || []).map((task) => ({
    ...task,
    segments: (task.segments || []).map((segment) => ({
      ...segment,
      audioChunks: [],
    })),
  })),
});

export const buildSessionHistory = (session: Session | undefined) =>
  (session?.tasks ?? []).flatMap((task) => {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const prompt = task.prompt.trim();
    const response = task.segments
      .map((segment) => segment.text ?? '')
      .join('')
      .trim();

    if (prompt) {
      messages.push({ role: 'user', content: prompt });
    }

    if (response) {
      messages.push({ role: 'assistant', content: response });
    }

    return messages;
  });