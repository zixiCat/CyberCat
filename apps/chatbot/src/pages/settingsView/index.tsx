import { Alert, Button, Input, Select } from 'antd';
import {
  Eye,
  EyeOff,
  KeyRound,
  Save,
  Settings,
  Sparkles,
  Waves,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { SpeechLab } from './SpeechLab';

interface SettingsField {
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

type SettingsValue = string | boolean;
const NAVIGATE_BACK_DELTA = -1;
const DEFAULT_TEXTAREA_ROWS = 4;

interface SettingsMessage {
  type: 'success' | 'error';
  text: string;
}

const loadSettingsValues = async (): Promise<Record<string, SettingsValue>> => {
  if (!window.backend?.get_settings) {
    throw new Error('Settings backend is not ready.');
  }

  return JSON.parse(await window.backend.get_settings()) as Record<string, SettingsValue>;
};

const SETTINGS_FIELDS: SettingsField[] = [
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

const SPEECH_FIELDS: SettingsField[] = [
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
    description: 'Enter one term per line or separate with commas to help ASR recognize project-specific words.',
  },
];

const REQUIRED_FIELDS = [...SETTINGS_FIELDS, ...SPEECH_FIELDS].filter((field) => field.required);

interface SettingsViewProps {
  onSaved?: () => void;
}

export const SettingsView = ({ onSaved }: SettingsViewProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState<Record<string, SettingsValue>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<SettingsMessage | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<'ai' | 'speech'>('ai');
  const backgroundLocation = location.state?.backgroundLocation;

  const syncStateFromBackend = async () => {
    setValues(await loadSettingsValues());
  };

  const handleClose = () => {
    if (backgroundLocation) {
      navigate(NAVIGATE_BACK_DELTA);
      return;
    }

    navigate('/chat', { replace: true });
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (cancelled) {
        return;
      }

      if (!window.backend?.get_settings) {
        window.setTimeout(load, 150);
        return;
      }

      try {
        await syncStateFromBackend();
      } catch {
        // ignore initial load failures and allow the user to retry via actions
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (!window.backend?.save_settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const resultJson = await window.backend.save_settings(JSON.stringify(values));
      const result = JSON.parse(resultJson);
      if (result.ok) {
        setMessage({ type: 'success', text: 'Settings saved.' });
        if (onSaved) {
          onSaved();
        } else if (backgroundLocation) {
          navigate(NAVIGATE_BACK_DELTA);
        } else {
          navigate('/chat', { replace: true });
        }
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save.' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save.';
      setMessage({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getStringValue = (key: string) => (typeof values[key] === 'string' ? values[key] : '');

  const requiredMissing = REQUIRED_FIELDS.filter(
    (field) => field.required && !getStringValue(field.key).trim(),
  );

  const hasRequiredMissing = Boolean(requiredMissing.length);
  const isOverlay = Boolean(backgroundLocation);

  return (
    <div
      className={`
        cybercat-settings

        ${
          isOverlay
            ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-[3px]'
            : 'min-h-screen p-3'
        }
      `}
      onClick={() => {
        if (isOverlay) {
          handleClose();
        }
      }}
    >
      <section
        className={`
          cybercat-shell relative flex w-full overflow-hidden

          ${isOverlay ? 'h-[min(760px,calc(100vh-24px))] max-w-6xl' : 'h-[calc(100vh-24px)]'}
        `}
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          onClick={handleClose}
          className="absolute! top-4 right-4 z-10"
          aria-label="Close settings"
        >
          <X size={16} />
        </Button>

        <aside className="
          flex w-[248px] shrink-0 flex-col justify-between border-r border-zinc-200/80 p-4

          dark:border-white/10
        ">
          <div className="space-y-6">
            <div className="flex items-start gap-3 pr-12">
              <div className="flex items-center gap-3">
                <div className="
                  cybercat-icon-tile bg-zinc-100 text-zinc-700

                  dark:bg-zinc-800 dark:text-zinc-100
                ">
                  <Settings size={18} />
                </div>
                <div>
                  <h1 className="
                    text-sm font-semibold text-zinc-900

                    dark:text-zinc-100
                  ">
                    Settings
                  </h1>
                  <p className="
                    text-xs text-zinc-500

                    dark:text-zinc-400
                  ">
                    Configure AI access and speech tools.
                  </p>
                </div>
              </div>
            </div>

            <nav className="space-y-2">
              <button
                type="button"
                onClick={() => setActiveSection('ai')}
                className={`
                  cybercat-nav-item

                  ${
                  activeSection === 'ai'
                    ? `
                      cybercat-nav-item-active text-zinc-900

                      dark:text-zinc-100
                    `
                    : `
                      text-zinc-600

                      hover:border-zinc-200 hover:bg-white hover:text-zinc-900

                      dark:text-zinc-300

                      dark:hover:border-white/10 dark:hover:bg-zinc-800 dark:hover:text-zinc-100
                    `
                }
                `}
              >
                <Sparkles size={16} />
                <span>
                  <span className="block text-sm font-medium">AI & APIs</span>
                  <span className="block text-xs opacity-70">Models, keys, chat endpoints</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('speech')}
                className={`
                  cybercat-nav-item

                  ${
                  activeSection === 'speech'
                    ? `
                      cybercat-nav-item-active text-zinc-900

                      dark:text-zinc-100
                    `
                    : `
                      text-zinc-600

                      hover:border-zinc-200 hover:bg-white hover:text-zinc-900

                      dark:text-zinc-300

                      dark:hover:border-white/10 dark:hover:bg-zinc-800 dark:hover:text-zinc-100
                    `
                }
                `}
              >
                <Waves size={16} />
                <span>
                  <span className="block text-sm font-medium">Speech Tools</span>
                  <span className="block text-xs opacity-70">Hotwords, TTS, ASR</span>
                </span>
              </button>
            </nav>
          </div>

          <div>
            <Button
              block
              size="large"
              loading={saving}
              onClick={handleSave}
              icon={<Save size={14} />}
              disabled={hasRequiredMissing}
              className="cybercat-gradient-button rounded-lg! border-none! shadow-none!"
            >
              Save Settings
            </Button>
          </div>
        </aside>

        <div className="
          flex min-h-0 flex-1 flex-col

          dark:bg-zinc-900
        ">
          <div className="
            border-b border-zinc-200/80 px-6 py-5

            dark:border-white/10
          ">
            <h2 className="
              text-lg font-semibold text-zinc-900

              dark:text-zinc-100
            ">
              {activeSection === 'ai' ? 'AI & APIs' : 'Speech Tools'}
            </h2>
            <p className="
              mt-1 text-sm text-zinc-500

              dark:text-zinc-400
            ">
              {activeSection === 'ai'
                ? 'Set the providers and credentials the assistant depends on.'
                : 'Tune recognition terms and run quick speech checks without leaving the page.'}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-4 pb-2">
              {activeSection === 'ai' ? (
                <>
                  <div className="cybercat-panel p-5">
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="
                          text-sm font-semibold text-zinc-900

                          dark:text-zinc-100
                        ">
                          AI & APIs
                        </h3>
                        <p className="
                          mt-1 text-xs text-zinc-500

                          dark:text-zinc-400
                        ">
                          Models, keys, and chat endpoints
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-6">
                      {SETTINGS_FIELDS.map((field) => (
                        <div key={field.key}>
                          <label className="
                            mb-2 block text-sm font-medium text-zinc-600

                            dark:text-zinc-300
                          ">
                            {field.label}
                            {field.required && <span className="ml-1 text-red-400">*</span>}
                          </label>
                          <Input
                            value={getStringValue(field.key)}
                            onChange={(e) =>
                              setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            placeholder={field.placeholder}
                            type={field.secret && !revealedKeys.has(field.key) ? 'password' : 'text'}
                            autoComplete="off"
                            suffix={
                              field.secret ? (
                                <button
                                  type="button"
                                  onClick={() => toggleReveal(field.key)}
                                  className="
                                    cursor-pointer border-none bg-transparent p-0 text-zinc-400

                                    hover:text-zinc-600

                                    dark:hover:text-zinc-300
                                  "
                                >
                                  {revealedKeys.has(field.key) ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              ) : undefined
                            }
                          />
                          {field.description && (
                            <span className="
                              mt-2 block text-xs text-zinc-500

                              dark:text-zinc-400
                            ">
                              {field.description}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {message && (
                    <Alert
                      type={message.type === 'success' ? 'success' : 'error'}
                      message={message.text}
                      showIcon
                    />
                  )}

                  {hasRequiredMissing && (
                    <Alert
                      type="warning"
                      message={`Missing required: ${requiredMissing.map((f) => f.label).join(', ')}`}
                      showIcon
                    />
                  )}
                </>
              ) : (
                <>
                  <div className="cybercat-panel p-5">
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="
                          text-sm font-semibold text-zinc-900

                          dark:text-zinc-100
                        ">
                          Speech Tools
                        </h3>
                        <p className="
                          mt-1 text-xs text-zinc-500

                          dark:text-zinc-400
                        ">
                          Qwen speech credentials, endpoints, and live testing
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-6">
                      {SPEECH_FIELDS.map((field) => (
                        <div key={field.key}>
                          <label className="
                            mb-2 flex items-center gap-2 text-sm font-medium text-zinc-600

                            dark:text-zinc-300
                          ">
                            <KeyRound size={14} />
                            {field.label}
                          </label>
                          {field.multiline ? (
                            <Input.TextArea
                              rows={field.rows ?? DEFAULT_TEXTAREA_ROWS}
                              value={getStringValue(field.key)}
                              onChange={(e) =>
                                setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                              placeholder={field.placeholder}
                              autoComplete="off"
                            />
                          ) : field.options ? (
                            <Select
                              size="large"
                              className="w-full"
                              value={getStringValue(field.key) || undefined}
                              onChange={(value) =>
                                setValues((prev) => ({ ...prev, [field.key]: value }))
                              }
                              options={field.options}
                              placeholder={field.placeholder}
                            />
                          ) : (
                            <Input
                              size="large"
                              value={getStringValue(field.key)}
                              onChange={(e) =>
                                setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                              placeholder={field.placeholder}
                              type={field.secret && !revealedKeys.has(field.key) ? 'password' : 'text'}
                              autoComplete="off"
                              suffix={
                                field.secret ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleReveal(field.key)}
                                    className="
                                      cursor-pointer border-none bg-transparent p-0 text-zinc-400

                                      hover:text-zinc-600

                                      dark:hover:text-zinc-300
                                    "
                                  >
                                    {revealedKeys.has(field.key) ? <EyeOff size={14} /> : <Eye size={14} />}
                                  </button>
                                ) : undefined
                              }
                            />
                          )}
                          {field.description && (
                            <span className="
                              mt-2 block text-xs text-zinc-500

                              dark:text-zinc-400
                            ">
                              {field.description}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <SpeechLab />
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
