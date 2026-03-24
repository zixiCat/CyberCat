import { Button, Popover, Segmented, Select, Tooltip } from 'antd';
import {
  Columns,
  Copy,
  FileText,
  Minus,
  Monitor,
  Moon,
  Music,
  Plus,
  Shuffle,
  Square,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import { ThemeMode } from '../App';
import { SettingsProfileButton } from '../components/SettingsProfileButton';
import { Session, VoiceOption } from './types';

export interface ChatHeaderProps {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  availablePrompts: string[];
  selectedPromptFile: string;
  setSelectedPromptFile: (file: string) => void;
  voiceOptions: VoiceOption[];
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
  randomVoicePool: string[];
  setRandomVoicePool: (voices: string[]) => void;
  selectedSessionId: string | null;
  updateSessions: (updater: (prev: Session[]) => Session[]) => void;
  setSelectedPromptContent: (content: string) => void;
  autoPlay: boolean;
  setAutoPlay: (autoPlay: boolean) => void;
  isTaskRunning: boolean;
  stopStreaming: () => void;
  clearCurrentChat: () => void;
  createNewSession: () => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  isWindowMaximized: boolean;
  startWindowDrag: () => void;
  minimizeWindow: () => void;
  toggleMaximizeWindow: () => void;
  closeWindow: () => void;
  reloadProfileSettings: () => Promise<void>;
}

export const ChatHeader = ({
  theme,
  setTheme,
  availablePrompts,
  selectedPromptFile,
  setSelectedPromptFile,
  voiceOptions,
  selectedVoice,
  setSelectedVoice,
  randomVoicePool,
  setRandomVoicePool,
  selectedSessionId,
  updateSessions,
  setSelectedPromptContent,
  autoPlay,
  setAutoPlay,
  isTaskRunning,
  stopStreaming,
  clearCurrentChat,
  createNewSession,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  isWindowMaximized,
  startWindowDrag,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  reloadProfileSettings,
}: ChatHeaderProps) => {
  const cyberCatLogoSrc = 'CyberCat.png';
  const EMPTY_VOICE_COUNT = 0;
  const PRIMARY_MOUSE_BUTTON = 0;
  const isDesktopRuntime = Boolean(window.backend);
  const hasCustomRandomVoicePool = randomVoicePool.length > EMPTY_VOICE_COUNT;
  const randomVoiceOptions = voiceOptions.filter((option) => option.value !== 'auto');

  const handleRandomVoicePoolChange = (voices: string[]) => {
    setRandomVoicePool(voices);
    window.backend?.set_random_voice_pool(JSON.stringify(voices));
  };

  return (
    <div
      className="
        rounded-xl bg-zinc-50 px-3 py-2 shadow-sm

        dark:bg-zinc-900
      "
    >
      <div
        className="
          flex items-center justify-between gap-3 border-b border-zinc-200/80 pb-2

          dark:border-white/10
        "
      >
        <div
          className="
            flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-lg p-1 select-none
          "
          onMouseDown={(event) => {
            if (event.button !== PRIMARY_MOUSE_BUTTON || !isDesktopRuntime) {
              return;
            }
            event.preventDefault();
            startWindowDrag();
          }}
          onDoubleClick={() => {
            if (!isDesktopRuntime) {
              return;
            }
            toggleMaximizeWindow();
          }}
        >
          <img
            src={cyberCatLogoSrc}
            alt="CyberCat"
            className="size-6 shrink-0 rounded-md object-cover"
            draggable={false}
          />
          <span
            className="
              truncate bg-linear-to-r from-blue-500 to-violet-600 bg-clip-text text-[11px] font-bold
              tracking-[0.28em] text-transparent uppercase italic
            "
          >
            CyberCat
          </span>
        </div>

        {isDesktopRuntime && (
          <div className="flex items-center gap-1">
            <Tooltip title="Minimize">
              <Button
                type="text"
                size="small"
                onClick={minimizeWindow}
                icon={<Minus size={14} />}
                className="
                  hover:bg-zinc-200/70

                  dark:hover:bg-white/10
                "
              />
            </Tooltip>
            <Tooltip title={isWindowMaximized ? 'Restore' : 'Maximize'}>
              <Button
                type="text"
                size="small"
                onClick={toggleMaximizeWindow}
                icon={isWindowMaximized ? <Copy size={13} /> : <Square size={12} />}
                className="
                  hover:bg-zinc-200/70

                  dark:hover:bg-white/10
                "
              />
            </Tooltip>
            <Tooltip title="Close">
              <Button
                type="text"
                size="small"
                onClick={closeWindow}
                icon={<X size={14} />}
                className="
                  hover:bg-red-100 hover:text-red-600

                  dark:hover:bg-red-500/20
                "
              />
            </Tooltip>
          </div>
        )}
      </div>

      <div className="relative mt-2 flex flex-col gap-2 min-[660px]:flex-row min-[660px]:items-center">
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip title={isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}>
            <Button
              type="text"
              size="small"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              icon={<Columns size={14} className="opacity-80" />}
            />
          </Tooltip>
          <Tooltip title="New Session">
            <Button
              type="text"
              size="small"
              onClick={createNewSession}
              icon={<Plus size={14} className="text-blue-500 opacity-80" />}
            />
          </Tooltip>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1 min-[660px]:pr-11 min-[660px]:gap-1.5">
        <Select
          size="small"
          className="w-24 text-[10px] sm:w-28"
          value={selectedPromptFile}
          onChange={(file) => {
            setSelectedPromptFile(file);
            updateSessions((prev) =>
              prev.map((s) => (s.id === selectedSessionId ? { ...s, systemPromptFile: file } : s)),
            );
            window.backend?.get_prompt_content(file).then((content: string) => {
              setSelectedPromptContent(content);
              window.backend?.set_active_system_prompt(content);
            });
          }}
          options={availablePrompts.map((p) => ({
            label: p.replace(/\.(md|txt)$/, ''),
            value: p,
          }))}
          suffixIcon={<FileText size={10} className="opacity-40" />}
          variant="borderless"
        />

        <Select
          size="small"
          className="w-24 text-[10px] sm:w-32"
          value={selectedVoice}
          onChange={(voice) => {
            setSelectedVoice(voice);
            window.backend?.set_active_voice(voice);
          }}
          options={voiceOptions.map((option) => ({
            label: option.model === 'random' ? option.label : `${option.label}`,
            value: option.value,
          }))}
          suffixIcon={<Music size={10} className="opacity-40" />}
          variant="borderless"
        />

        {selectedVoice === 'auto' && (
          <Popover
            trigger="click"
            placement="bottom"
            content={
              <div className="flex w-64 flex-col gap-3">
                <div>
                  <div
                    className="
                      text-[11px] font-medium text-zinc-700

                      dark:text-zinc-200
                    "
                  >
                    Random voice pool
                  </div>
                  <div
                    className="
                      mt-1 text-[10px] text-zinc-500

                      dark:text-zinc-400
                    "
                  >
                    Auto will only pick from these voices. Leave empty to use all voices.
                  </div>
                </div>

                <Select
                  mode="multiple"
                  size="small"
                  value={randomVoicePool}
                  options={randomVoiceOptions.map((option) => ({
                    label: option.label,
                    value: option.value,
                  }))}
                  onChange={(voices) => handleRandomVoicePoolChange(voices)}
                  placeholder="Use all voices"
                  className="w-full"
                />

                <div className="flex items-center justify-between gap-2">
                  <Button
                    size="small"
                    type="text"
                    onClick={() =>
                      handleRandomVoicePoolChange(randomVoiceOptions.map((option) => option.value))
                    }
                  >
                    Select all
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => handleRandomVoicePoolChange([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            }
          >
            <Tooltip
              title={
                hasCustomRandomVoicePool
                  ? `Random pool: ${randomVoicePool.length} voices`
                  : 'Random pool: all voices'
              }
            >
              <Button
                type="text"
                size="small"
                icon={<Shuffle size={14} className="opacity-80" />}
                className="
                  text-zinc-500

                  hover:text-blue-500

                  dark:text-zinc-400
                "
              >
                <span className="text-[10px]">
                  {hasCustomRandomVoicePool ? randomVoicePool.length : 'All'}
                </span>
              </Button>
            </Tooltip>
          </Popover>
        )}

        <Segmented
          size="small"
          value={theme}
          classNames={{
            label: 'flex items-center',
          }}
          onChange={(value) => setTheme(value as ThemeMode)}
          options={[
            { value: 'light', icon: <Sun size={12} /> },
            { value: 'system', icon: <Monitor size={12} /> },
            { value: 'dark', icon: <Moon size={12} /> },
          ]}
          className="
            bg-gray-100/50 text-[10px]

            dark:bg-white/5
          "
        />

        <Tooltip title={autoPlay ? 'Auto-play: ON' : 'Auto-play: OFF'} placement="bottom">
          <Button
            type="text"
            size="small"
            onClick={() => setAutoPlay(!autoPlay)}
            icon={
              autoPlay ? (
                <Volume2 size={14} className="text-blue-500" />
              ) : (
                <VolumeX size={14} className="text-gray-400" />
              )
            }
            className="
              hover:bg-gray-100

              dark:hover:bg-white/5
            "
          />
        </Tooltip>

        <div
          className="
            h-4 w-px bg-gray-200

            dark:bg-white/10
          "
        />

        {isTaskRunning && (
          <Tooltip title="Stop Response" placement="bottom">
            <Button
              type="text"
              size="small"
              onClick={stopStreaming}
              icon={<Square size={14} fill="currentColor" />}
              className="
                animate-pulse text-red-500

                hover:bg-red-50
              "
            />
          </Tooltip>
        )}

        <Tooltip title="Clear Current Chat" placement="left">
          <Button
            type="text"
            size="small"
            onClick={clearCurrentChat}
            icon={<Trash2 size={14} />}
            disabled={selectedSessionId === null}
            className="
              text-gray-400

              hover:text-red-500
            "
          />
        </Tooltip>

            <div className="min-[660px]:absolute min-[660px]:top-1/2 min-[660px]:right-0 min-[660px]:-translate-y-1/2">
              <Tooltip title="Profiles & Settings" placement="bottom">
                <SettingsProfileButton
                  onProfileApplied={reloadProfileSettings}
                  buttonClassName="text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-white/5"
                  placement="bottomRight"
                />
              </Tooltip>
            </div>
        </div>
      </div>
    </div>
  );
};
