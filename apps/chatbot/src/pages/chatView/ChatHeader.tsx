import { Button, Segmented, Select, Tooltip } from 'antd';
import {
  Columns,
  FileText,
  Monitor,
  Moon,
  Music,
  Plus,
  Square,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { useTheme } from '../App';
import { SettingsProfileButton } from '../components/SettingsProfileButton';
import { useChatSessionStore } from './chatSessionStore';
import { useChatUiStore } from './chatUiStore';
import { RandomVoicePoolPopover } from './RandomVoicePoolPopover';
import { WindowControls } from './WindowControls';

export interface ChatHeaderProps {
  stopStreaming: () => void;
  startWindowDrag: () => void;
  minimizeWindow: () => void;
  toggleMaximizeWindow: () => void;
  closeWindow: () => void;
  reloadProfileSettings: () => Promise<void>;
}

export const ChatHeader = ({
  stopStreaming,
  startWindowDrag,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  reloadProfileSettings,
}: ChatHeaderProps) => {
  const { theme, setTheme } = useTheme();
  const availablePrompts = useChatUiStore((state) => state.availablePrompts);
  const selectedPromptFile = useChatUiStore((state) => state.selectedPromptFile);
  const voiceOptions = useChatUiStore((state) => state.voiceOptions);
  const selectedVoice = useChatUiStore((state) => state.selectedVoice);
  const randomVoicePool = useChatUiStore((state) => state.randomVoicePool);
  const autoPlay = useChatUiStore((state) => state.autoPlay);
  const isTaskRunning = useChatUiStore((state) => state.isTaskRunning);
  const isSidebarCollapsed = useChatUiStore((state) => state.isSidebarCollapsed);
  const isWindowMaximized = useChatUiStore((state) => state.isWindowMaximized);
  const setAutoPlay = useChatUiStore((state) => state.setAutoPlay);
  const setUiState = useChatUiStore((state) => state.setUiState);
  const toggleSidebar = useChatUiStore((state) => state.toggleSidebar);
  const selectedSessionId = useChatSessionStore((state) => state.selectedSessionId);
  const updateSessions = useChatSessionStore((state) => state.updateSessions);
  const clearCurrentChat = useChatSessionStore((state) => state.clearCurrentChat);
  const createNewSession = useChatSessionStore((state) => state.createNewSession);
  const isDesktopRuntime = Boolean(window.backend);

  const handleRandomVoicePoolChange = (voices: string[]) => {
    setUiState({ randomVoicePool: voices });
    window.backend?.set_random_voice_pool?.(JSON.stringify(voices));
  };

  return (
    <div
      className="
        rounded-xl bg-zinc-50 px-3 py-2 shadow-sm

        dark:bg-zinc-900
      "
    >
      <WindowControls
        isDesktopRuntime={isDesktopRuntime}
        isWindowMaximized={isWindowMaximized}
        startWindowDrag={startWindowDrag}
        toggleMaximizeWindow={toggleMaximizeWindow}
        minimizeWindow={minimizeWindow}
        closeWindow={closeWindow}
      />

      <div className="
        relative mt-2 flex flex-col gap-2

        min-[660px]:flex-row min-[660px]:items-center
      ">
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip title={isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}>
            <Button
              type="text"
              size="small"
              onClick={toggleSidebar}
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

        <div className="
          flex min-w-0 flex-wrap items-center gap-1

          min-[660px]:gap-1.5 min-[660px]:pr-11
        ">
        <Select
          size="small"
          className="
            w-24 text-[10px]

            sm:w-28
          "
          value={selectedPromptFile}
          onChange={(file) => {
            setUiState({ selectedPromptFile: file });
            updateSessions((prev) =>
              prev.map((s) => (s.id === selectedSessionId ? { ...s, systemPromptFile: file } : s)),
            );
            window.backend?.get_prompt_content?.(file).then((content: string) => {
              setUiState({ selectedPromptContent: content });
              window.backend?.set_active_system_prompt?.(content);
            });
          }}
          options={availablePrompts.map((p) => ({
            label: p.name,
            value: p.file,
          }))}
          suffixIcon={<FileText size={10} className="opacity-40" />}
          variant="borderless"
        />

        <Select
          size="small"
          className="
            w-24 text-[10px]

            sm:w-32
          "
          value={selectedVoice}
          onChange={(voice) => {
            setUiState({ selectedVoice: voice });
            window.backend?.set_active_voice?.(voice);
          }}
          options={voiceOptions.map((option) => ({
            label: option.model === 'random' ? option.label : `${option.label}`,
            value: option.value,
          }))}
          suffixIcon={<Music size={10} className="opacity-40" />}
          variant="borderless"
        />

        <RandomVoicePoolPopover
          selectedVoice={selectedVoice}
          randomVoicePool={randomVoicePool}
          voiceOptions={voiceOptions}
          onPoolChange={handleRandomVoicePoolChange}
        />

        <Segmented
          size="small"
          value={theme}
          classNames={{
            label: 'flex items-center',
          }}
          onChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}
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

            <div className="
              min-[660px]:absolute min-[660px]:top-1/2 min-[660px]:right-0
              min-[660px]:-translate-y-1/2
            ">
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
