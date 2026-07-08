export type SelectionSpeakerConfig = {
  readonly enabled: boolean;
  readonly shortcut: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly voice: string;
  readonly languageType: string;
  readonly maxInputLength: number;
};

export const readSelectionSpeakerConfig = (env: NodeJS.ProcessEnv = process.env): SelectionSpeakerConfig => ({
  enabled: Boolean(env.SELECTION_SPEAKER_ENABLED?.trim() === 'true'),
  shortcut: env.SELECTION_SPEAKER_SHORTCUT?.trim() || 'Ctrl+Shift+0',
  apiKey: env.SELECTION_SPEAKER_TTS_API_KEY?.trim() || env.DASHSCOPE_API_KEY?.trim() || '',
  baseUrl: env.SELECTION_SPEAKER_TTS_BASE_URL?.trim() || 'https://llm-di5bh8xpfvtdaz9g.cn-beijing.maas.aliyuncs.com/api/v1',
  model: env.SELECTION_SPEAKER_TTS_MODEL?.trim() || 'qwen-tts-latest',
  voice: env.SELECTION_SPEAKER_TTS_VOICE?.trim() || 'Cherry',
  languageType: env.SELECTION_SPEAKER_TTS_LANGUAGE_TYPE?.trim() || 'Chinese',
  maxInputLength: Number(env.SELECTION_SPEAKER_MAX_INPUT_LENGTH?.trim()) || 600,
});