export interface SettingsField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  secret: boolean;
  multiline?: boolean;
  rows?: number;
  description?: string;
  options?: Array<{ label: string; value: string }>;
}

export type SettingsValue = string | boolean;

const DEFAULT_TEXTAREA_ROWS = 4;

export const SETTINGS_FIELDS: SettingsField[] = [
  {
    key: 'openai_api_key',
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    required: true,
    secret: true,
  },
  {
    key: 'openai_base_url',
    label: 'OpenAI Base URL',
    placeholder: 'https://api.openai.com/v1',
    required: true,
    secret: false,
  },
  {
    key: 'openai_model',
    label: 'OpenAI Model',
    placeholder: 'gpt-4o',
    required: true,
    secret: false,
  },
];

export const SPEECH_FIELDS: SettingsField[] = [
  {
    key: 'qwen_api_key',
    label: 'Qwen API Key (DashScope)',
    placeholder: 'sk-...',
    required: true,
    secret: true,
    description: 'Used only for Qwen TTS and ASR, not for the chat LLM.',
  },
  {
    key: 'qwen_asr_base_url',
    label: 'Qwen ASR URL',
    placeholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    required: false,
    secret: false,
    description: 'OpenAI-compatible endpoint used for speech recognition.',
  },
  {
    key: 'qwen_tts_base_url',
    label: 'Qwen TTS URL',
    placeholder: 'https://dashscope.aliyuncs.com/api/v1',
    required: false,
    secret: false,
    description: 'DashScope multimodal endpoint used for text-to-speech.',
  },
  {
    key: 'qwen_tts_model',
    label: 'Qwen TTS Model',
    placeholder: 'qwen-tts-latest',
    required: false,
    secret: false,
    description:
      'Aliyun TTS model is locked to qwen-tts-latest. This enables Cherry, Ethan, Serena, Chelsie, Jada, Dylan, and Sunny.',
    options: [{ label: 'qwen-tts-latest', value: 'qwen-tts-latest' }],
  },
  {
    key: 'qwen_hotwords',
    label: 'Qwen Hotwords',
    placeholder: 'CyberCat,zixiCat,OpenClaw',
    required: false,
    secret: false,
    multiline: true,
    rows: DEFAULT_TEXTAREA_ROWS,
    description:
      'Enter one term per line or separate with commas to help ASR recognize project-specific words.',
  },
];

export const REQUIRED_FIELDS = [...SETTINGS_FIELDS, ...SPEECH_FIELDS].filter((field) => field.required);