export type SelectionSpeakerConfig = {
  shortcut: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  voice: string;
  maxInputLength: number;
};

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

export const readSelectionSpeakerConfig = (env: NodeJS.ProcessEnv = process.env): SelectionSpeakerConfig => ({
  shortcut: env.SELECTION_SPEAKER_SHORTCUT?.trim() || 'Ctrl+Shift+0',
  apiKey: env.SELECTION_SPEAKER_API_KEY?.trim() || '',
  baseUrl: normalizeBaseUrl(env.SELECTION_SPEAKER_BASE_URL?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1'),
  model: env.SELECTION_SPEAKER_MODEL?.trim() || 'qwen-omni',
  voice: env.SELECTION_SPEAKER_VOICE?.trim() || 'Chelsie',
  maxInputLength: Number(env.SELECTION_SPEAKER_MAX_INPUT_LENGTH?.trim()) || 600,
});