import { Alert, Button } from 'antd';
import {
  Save,
  ScanQrCode,
  Settings,
  Sparkles,
  Waves,
  X,
} from 'lucide-react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSetState } from 'react-use';

import { loadBackendJson, waitForBackend } from '../backendShared';
import { BilibiliAuthPanel } from './BilibiliAuthPanel';
import { SettingsFieldList } from './SettingsFieldList';
import {
  BILIBILI_FIELDS,
  REQUIRED_FIELDS,
  SETTINGS_FIELDS,
  SettingsValue,
  SPEECH_FIELDS,
} from './settingsFields';
import { SpeechLab } from './SpeechLab';

const NAVIGATE_BACK_DELTA = -1;

interface SettingsMessage {
  type: 'success' | 'error';
  text: string;
}

interface SaveSettingsResult {
  ok: boolean;
  error?: string;
}

interface SettingsViewState {
  values: Record<string, SettingsValue>;
  saving: boolean;
  message: SettingsMessage | null;
  revealedKeys: Set<string>;
  activeSection: 'ai' | 'bilibili' | 'speech';
}

const loadSettingsValues = async () =>
  loadBackendJson<Record<string, SettingsValue>>(() => window.backend?.get_settings?.(), 'Settings');

interface SettingsViewProps {
  onSaved?: () => void;
}

export const SettingsView = ({ onSaved }: SettingsViewProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useSetState<SettingsViewState>({
    values: {},
    saving: false,
    message: null,
    revealedKeys: new Set<string>(),
    activeSection: 'ai',
  });
  const { values, saving, message, revealedKeys, activeSection } = state;
  const backgroundLocation = location.state?.backgroundLocation;

  const refreshSettingsValues = async () => {
    const nextValues = await loadSettingsValues();
    setState({ values: nextValues });
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
      const backend = await waitForBackend({
        retryDelayMs: 150,
        isCancelled: () => cancelled,
      });

      if (!backend?.get_settings || cancelled) {
        return;
      }

      try {
        const nextValues = await loadSettingsValues();
        if (!cancelled) {
          setState({ values: nextValues });
        }
      } catch {
        // ignore initial load failures and allow the user to retry via actions
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [setState]);

  const handleSave = async () => {
    if (!window.backend?.save_settings) return;
    setState({ saving: true, message: null });
    try {
      const result = await loadBackendJson<SaveSettingsResult>(
        () => window.backend?.save_settings?.(JSON.stringify(values)),
        'Save settings',
      );
      if (result.ok) {
        setState({ message: { type: 'success', text: 'Settings saved.' } });
        if (onSaved) {
          onSaved();
        } else if (backgroundLocation) {
          navigate(NAVIGATE_BACK_DELTA);
        } else {
          navigate('/chat', { replace: true });
        }
      } else {
        setState({ message: { type: 'error', text: result.error || 'Failed to save.' } });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save.';
      setState({ message: { type: 'error', text: msg } });
    } finally {
      setState({ saving: false });
    }
  };

  const toggleReveal = (key: string) => {
    setState((currentState) => {
      const next = new Set(currentState.revealedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { revealedKeys: next };
    });
  };

  const setValue = (key: string, value: SettingsValue) => {
    setState((currentState) => ({
      values: {
        ...currentState.values,
        [key]: value,
      },
    }));
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
            ? `
              fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3
              backdrop-blur-[3px]
            `
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
                onClick={() => setState({ activeSection: 'ai' })}
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
                onClick={() => setState({ activeSection: 'bilibili' })}
                className={`
                  cybercat-nav-item

                  ${
                  activeSection === 'bilibili'
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
                <ScanQrCode size={16} />
                <span>
                  <span className="block text-sm font-medium">Bilibili</span>
                  <span className="block text-xs opacity-70">Local cookie and QR login</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setState({ activeSection: 'speech' })}
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
              {activeSection === 'ai'
                ? 'AI & APIs'
                : activeSection === 'bilibili'
                  ? 'Bilibili'
                  : 'Speech Tools'}
            </h2>
            <p className="
              mt-1 text-sm text-zinc-500

              dark:text-zinc-400
            ">
              {activeSection === 'ai'
                ? 'Set the providers and credentials the assistant depends on.'
                : activeSection === 'bilibili'
                  ? 'Keep the BBDown cookie local, refresh it with QR login, and avoid storing secrets in the repo.'
                  : 'Tune recognition terms and run quick speech checks without leaving the page.'}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-4 pb-2">
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

              {activeSection === 'ai' ? (
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
                    <SettingsFieldList
                      fields={SETTINGS_FIELDS}
                      values={values}
                      revealedKeys={revealedKeys}
                      onValueChange={setValue}
                      onToggleReveal={toggleReveal}
                      showRequiredMarker
                    />
                  </div>
                </div>
              ) : activeSection === 'bilibili' ? (
                <>
                  <div className="cybercat-panel p-5">
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="
                          text-sm font-semibold text-zinc-900

                          dark:text-zinc-100
                        ">
                          BBDown Settings
                        </h3>
                        <p className="
                          mt-1 text-xs text-zinc-500

                          dark:text-zinc-400
                        ">
                          Target URL and cookie for local Bilibili downloads
                        </p>
                      </div>
                    </div>
                    <SettingsFieldList
                      fields={BILIBILI_FIELDS}
                      values={values}
                      revealedKeys={revealedKeys}
                      onValueChange={setValue}
                      onToggleReveal={toggleReveal}
                      showLeadingIcon
                      controlSize="large"
                    />
                  </div>

                  <BilibiliAuthPanel onCookieSaved={refreshSettingsValues} />
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
                    <SettingsFieldList
                      fields={SPEECH_FIELDS}
                      values={values}
                      revealedKeys={revealedKeys}
                      onValueChange={setValue}
                      onToggleReveal={toggleReveal}
                      showLeadingIcon
                      controlSize="large"
                    />
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
