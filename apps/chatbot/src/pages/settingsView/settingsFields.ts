export interface SettingsField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  secret: boolean;
  control?: 'switch';
  multiline?: boolean;
  rows?: number;
  description?: string;
  options?: Array<{ label: string; value: string }>;
}

export type SettingsValue = string | boolean;

const DEFAULT_TEXTAREA_ROWS = 4;

export const FEATURE_FIELDS: SettingsField[] = [
  {
    key: 'feature_bilibili_enabled',
    label: 'Enable Bilibili tools',
    placeholder: '',
    required: false,
    secret: false,
    control: 'switch',
    description:
      'Turns on the Bilibili settings page, QR login flow, and backend handlers. Leave this off to keep the feature dormant.',
  },
  {
    key: 'feature_file_ingest_enabled',
    label: 'Enable file ingest',
    placeholder: '',
    required: false,
    secret: false,
    control: 'switch',
    description:
      'Turns on native file-drop ingest, the archive folder settings page, and backend handlers. Dropped local files will be organized and routed to your configured folders.',
  },
];

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

export const BILIBILI_FIELDS: SettingsField[] = [
  {
    key: 'bilibili_url',
    label: 'Bilibili URL',
    placeholder: 'https://space.bilibili.com/.../favlist?fid=...',
    required: false,
    secret: false,
    description:
      'The Bilibili space or favourites URL that BBDown will download from.',
  },
  {
    key: 'bilibili_cookie',
    label: 'Bilibili Cookie (BBDown.data)',
    placeholder: 'SESSDATA=...; bili_jct=...; DedeUserID=...',
    required: false,
    secret: true,
    description:
      'Paste the full contents of BBDown.data if you already have it. QR login below can fill this automatically.',
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