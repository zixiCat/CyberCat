export type SelectionSpeakerConfig = {
  readonly enabled: boolean;
  readonly shortcut: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly voice: string;
  readonly languageType: string;
  readonly maxInputLength: number;
  readonly copyDelayMs: number;
};

const modelAliases: Record<string, string> = {
  'qwen-tts-flash': 'qwen3-tts-flash',
  'qwen-tts-instruct-flash': 'qwen3-tts-instruct-flash',
  'qwen-tts-latest': 'qwen3-tts-flash',
};

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return defaultValue;
};

const parsePositiveInteger = (value: string | undefined, defaultValue: number): number => {
  if (!value) {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return defaultValue;
  }

  return parsedValue;
};

const normalizeBaseUrl = (value: string): string => {
  const trimmedValue = value.trim().replace(/\/+$/, '');

  if (!trimmedValue) {
    return 'https://dashscope.aliyuncs.com/api/v1';
  }

  if (trimmedValue.endsWith('/compatible-mode/v1')) {
    return `${trimmedValue.slice(0, -'/compatible-mode/v1'.length)}/api/v1`;
  }

  if (trimmedValue.endsWith('/api/v1')) {
    return trimmedValue;
  }

  return `${trimmedValue}/api/v1`;
};

const normalizeModel = (value: string): string => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return 'qwen3-tts-flash';
  }

  return modelAliases[trimmedValue] ?? trimmedValue;
};

export const readSelectionSpeakerConfig = (env: NodeJS.ProcessEnv = process.env): SelectionSpeakerConfig => ({
  enabled: parseBoolean(env.SELECTION_SPEAKER_ENABLED, true),
  shortcut: env.SELECTION_SPEAKER_SHORTCUT?.trim() || 'Ctrl+Shift+0',
  apiKey: env.SELECTION_SPEAKER_TTS_API_KEY?.trim() || env.DASHSCOPE_API_KEY?.trim() || env.apiKey?.trim() || '',
  baseUrl: normalizeBaseUrl(
    env.SELECTION_SPEAKER_TTS_BASE_URL
    || env.DASHSCOPE_BASE_URL
    || env.baseURL
    || 'https://dashscope.aliyuncs.com'
  ),
  model: normalizeModel(env.SELECTION_SPEAKER_TTS_MODEL || env.DASHSCOPE_MODEL || env.model || 'qwen-tts-latest'),
  voice: env.SELECTION_SPEAKER_TTS_VOICE?.trim() || 'Cherry',
  languageType: env.SELECTION_SPEAKER_TTS_LANGUAGE_TYPE?.trim() || 'Chinese',
  maxInputLength: parsePositiveInteger(env.SELECTION_SPEAKER_MAX_INPUT_LENGTH, 600),
  copyDelayMs: parsePositiveInteger(env.SELECTION_SPEAKER_COPY_DELAY_MS, 0),
});