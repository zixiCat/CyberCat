import { type RefObject } from 'react';

import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { ChatList } from './ChatList';
import { Sidebar } from './Sidebar';
import { TaskLogPanel } from './TaskLogPanel';
import { ChunkSegment } from './types';

interface ChatViewLayoutProps {
  chatScrollContainerRef: RefObject<HTMLDivElement | null>;
  closeWindow: () => void;
  handleSendMessage: (text: string) => boolean;
  inputId: string;
  minimizeWindow: () => void;
  playAudio: (segment: ChunkSegment) => void;
  registerTaskElement: (taskId: number, element: HTMLDivElement | null) => void;
  reloadProfileSettings: () => Promise<void>;
  setThinkingEnabled: (enabled: boolean) => void;
  startWindowDrag: () => void;
  stopStreaming: () => void;
  toggleMaximizeWindow: () => void;
}

export const ChatViewLayout = ({
  chatScrollContainerRef,
  closeWindow,
  handleSendMessage,
  inputId,
  minimizeWindow,
  playAudio,
  registerTaskElement,
  reloadProfileSettings,
  setThinkingEnabled,
  startWindowDrag,
  stopStreaming,
  toggleMaximizeWindow,
}: ChatViewLayoutProps) => (
  <div
    className="
      flex h-screen bg-zinc-100 p-3

      dark:bg-[#1f1f1f] dark:text-white
    "
  >
    <Sidebar />
    <div className="flex flex-1 flex-col gap-2 overflow-hidden">
      <ChatHeader
        stopStreaming={stopStreaming}
        startWindowDrag={startWindowDrag}
        minimizeWindow={minimizeWindow}
        toggleMaximizeWindow={toggleMaximizeWindow}
        closeWindow={closeWindow}
        reloadProfileSettings={reloadProfileSettings}
      />
      <div
        className="
          flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-zinc-50 shadow-sm

          dark:bg-zinc-900
        "
      >
        <ChatList
          playAudio={playAudio}
          chatScrollContainerRef={chatScrollContainerRef}
          registerTaskElement={registerTaskElement}
        />
        <div className="relative">
          <TaskLogPanel className="absolute right-3 bottom-full left-3 mb-3" />
          <ChatInput
            handleSendMessage={handleSendMessage}
            inputId={inputId}
            setThinkingEnabled={setThinkingEnabled}
          />
        </div>
      </div>
    </div>
  </div>
);