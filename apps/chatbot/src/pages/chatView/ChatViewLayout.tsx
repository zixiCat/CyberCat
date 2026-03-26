import { type RefObject } from 'react';

import { ThemeMode } from '../App';
import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { ChatList } from './ChatList';
import { Sidebar } from './Sidebar';
import { ChunkSegment, Session, VoiceOption } from './types';

interface ChatViewLayoutProps {
  autoPlay: boolean;
  availablePrompts: string[];
  chatScrollContainerRef: RefObject<HTMLDivElement | null>;
  clearCurrentChat: () => void;
  closeWindow: () => void;
  createNewSession: () => void;
  currentReceivingSegmentId: number | null;
  handleSendMessage: (text: string) => boolean;
  inputId: string;
  isSidebarCollapsed: boolean;
  isTaskRunning: boolean;
  isWindowMaximized: boolean;
  minimizeWindow: () => void;
  playAudio: (segment: ChunkSegment) => void;
  playingSegmentId: number | null;
  randomVoicePool: string[];
  registerTaskElement: (taskId: number, element: HTMLDivElement | null) => void;
  reloadProfileSettings: () => Promise<void>;
  selectedPromptFile: string;
  selectedSession: Session | undefined;
  selectedSessionId: string | null;
  selectedVoice: string;
  sessions: Session[];
  setAutoPlay: (autoPlay: boolean) => void;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  setRandomVoicePool: (voices: string[]) => void;
  setSelectedPromptContent: (content: string) => void;
  setSelectedPromptFile: (file: string) => void;
  setSelectedSessionId: (id: string | null) => void;
  setSelectedVoice: (voice: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setThinkingEnabled: (enabled: boolean) => void;
  startWindowDrag: () => void;
  stopStreaming: () => void;
  thinkingEnabled: boolean;
  thinkingSupported: boolean;
  theme: ThemeMode;
  toggleMaximizeWindow: () => void;
  updateSessions: (updater: (prev: Session[]) => Session[]) => void;
  voiceOptions: VoiceOption[];
}

export const ChatViewLayout = ({
  autoPlay,
  availablePrompts,
  chatScrollContainerRef,
  clearCurrentChat,
  closeWindow,
  createNewSession,
  currentReceivingSegmentId,
  handleSendMessage,
  inputId,
  isSidebarCollapsed,
  isTaskRunning,
  isWindowMaximized,
  minimizeWindow,
  playAudio,
  playingSegmentId,
  randomVoicePool,
  registerTaskElement,
  reloadProfileSettings,
  selectedPromptFile,
  selectedSession,
  selectedSessionId,
  selectedVoice,
  sessions,
  setAutoPlay,
  setIsSidebarCollapsed,
  setRandomVoicePool,
  setSelectedPromptContent,
  setSelectedPromptFile,
  setSelectedSessionId,
  setSelectedVoice,
  setTheme,
  setThinkingEnabled,
  startWindowDrag,
  stopStreaming,
  thinkingEnabled,
  thinkingSupported,
  theme,
  toggleMaximizeWindow,
  updateSessions,
  voiceOptions,
}: ChatViewLayoutProps) => (
  <div
    className="
      flex h-screen bg-zinc-100 p-3

      dark:bg-[#1f1f1f] dark:text-white
    "
  >
    <Sidebar
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      setSelectedSessionId={setSelectedSessionId}
      isCollapsed={isSidebarCollapsed}
    />
    <div className="flex flex-1 flex-col gap-2 overflow-hidden">
      <ChatHeader
        theme={theme}
        setTheme={setTheme}
        availablePrompts={availablePrompts}
        selectedPromptFile={selectedPromptFile}
        setSelectedPromptFile={setSelectedPromptFile}
        voiceOptions={voiceOptions}
        selectedVoice={selectedVoice}
        setSelectedVoice={setSelectedVoice}
        randomVoicePool={randomVoicePool}
        setRandomVoicePool={setRandomVoicePool}
        selectedSessionId={selectedSessionId}
        updateSessions={updateSessions}
        setSelectedPromptContent={setSelectedPromptContent}
        autoPlay={autoPlay}
        setAutoPlay={setAutoPlay}
        isTaskRunning={isTaskRunning}
        stopStreaming={stopStreaming}
        clearCurrentChat={clearCurrentChat}
        createNewSession={createNewSession}
        isSidebarCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
        isWindowMaximized={isWindowMaximized}
        startWindowDrag={startWindowDrag}
        minimizeWindow={minimizeWindow}
        toggleMaximizeWindow={toggleMaximizeWindow}
        closeWindow={closeWindow}
        reloadProfileSettings={reloadProfileSettings}
      />
      <div
        className="
          flex flex-1 flex-col overflow-hidden rounded-xl bg-zinc-50 shadow-sm

          dark:bg-zinc-900
        "
      >
        <ChatList
          selectedSession={selectedSession}
          sessions={sessions}
          playingSegmentId={playingSegmentId}
          currentReceivingSegmentId={currentReceivingSegmentId}
          playAudio={playAudio}
          chatScrollContainerRef={chatScrollContainerRef}
          registerTaskElement={registerTaskElement}
        />
        <ChatInput
          isTaskRunning={isTaskRunning}
          handleSendMessage={handleSendMessage}
          inputId={inputId}
          thinkingEnabled={thinkingEnabled}
          thinkingSupported={thinkingSupported}
          setThinkingEnabled={setThinkingEnabled}
        />
      </div>
    </div>
  </div>
);