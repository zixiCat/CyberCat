import { Music2 } from 'lucide-react';
import { memo, type RefObject } from 'react';

import { ChatTaskCard } from './ChatTaskCard';
import { ChunkSegment, Session } from './types';

interface ChatListProps {
  selectedSession: Session | undefined;
  sessions: Session[];
  playingSegmentId: number | null;
  currentReceivingSegmentId: number | null;
  playAudio: (segment: ChunkSegment) => void;
  chatScrollContainerRef: RefObject<HTMLDivElement | null>;
  chatScrollPaddingBottom: number;
  registerTaskElement: (taskId: number, element: HTMLDivElement | null) => void;
}

const ZERO_ITEMS = 0;

const EmptyChatState = memo(({ selectedSession, sessions }: Pick<ChatListProps, 'selectedSession' | 'sessions'>) => {
  const cyberCatLogoSrc = 'CyberCat.png';
  const message = selectedSession
    ? 'Ask anything and CyberCat will stream the response in real time.'
    : sessions.length > ZERO_ITEMS
      ? 'Select a chat from history or create a new session to continue.'
      : 'Welcome to CyberCat. Start your first session to begin.';

  const paragraphs =  [
          'Create a session with the + button, then send your first message below.',
          'Use Enter to send. Use Shift+Enter if you want a new line.',
          'Press Ctrl+Shift+0 to play pronunciation audio for selected text.',
          'You can change prompt style, voice, and auto-play from the top bar.',
        ];

  return (
    <div className="flex w-full justify-center px-5 py-8 text-center">
      <div className="max-w-xl space-y-3">
        <div className="flex flex-col items-center justify-center gap-3">
          <img
            src={cyberCatLogoSrc}
            alt="CyberCat"
            className="
              size-20 rounded-2xl object-cover shadow-sm ring-1 ring-black/5

              dark:ring-white/10
            "
            draggable={false}
          />
          <div className="flex items-center justify-center gap-2">
            <Music2 size={18} className="text-blue-500" />
          <span className="
            bg-linear-to-r from-blue-500 to-violet-600 bg-clip-text text-[22px] font-semibold
            tracking-[0.24em] text-transparent uppercase
          ">
            CyberCat
          </span>
          </div>
        </div>
        <p className="
          text-[18px] font-medium text-gray-700

          dark:text-gray-200
        ">
          {message}
        </p>
        <div className="space-y-2 pt-1">
          {paragraphs.map((paragraph) => (
            <p key={paragraph} className="
              text-[14px] text-gray-500

              dark:text-gray-400
            ">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
});

export const ChatList = memo(({
  selectedSession,
  sessions,
  playingSegmentId,
  currentReceivingSegmentId,
  playAudio,
  chatScrollContainerRef,
  chatScrollPaddingBottom,
  registerTaskElement,
}: ChatListProps) => {
  const tasks = selectedSession?.tasks ?? [];
  const hasMessages = tasks.length > ZERO_ITEMS;

  return (
    <div
      ref={chatScrollContainerRef}
      style={hasMessages ? { paddingBottom: `${chatScrollPaddingBottom}px` } : undefined}
      className={
        hasMessages
          ? 'flex flex-1 flex-col gap-3 overflow-auto px-3 pt-3'
          : 'flex flex-1 items-center justify-center overflow-auto p-3'
      }
    >
      {!hasMessages ? (
        <EmptyChatState selectedSession={selectedSession} sessions={sessions} />
      ) : (
        tasks.map((task) => (
          <ChatTaskCard
            key={task.id}
            currentReceivingSegmentId={currentReceivingSegmentId}
            playingSegmentId={playingSegmentId}
            playAudio={playAudio}
            registerTaskElement={registerTaskElement}
            task={task}
          />
        ))
      )}
    </div>
  );
});
