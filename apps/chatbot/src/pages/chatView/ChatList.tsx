import { Button } from 'antd';
import { Music2, Play, Volume2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RefObject } from 'react';

import { ChunkSegment, Session } from './types';

interface ChatListProps {
  selectedSession: Session | undefined;
  sessions: Session[];
  playingSegmentId: number | null;
  currentReceivingSegmentId: number | null;
  playAudio: (segment: ChunkSegment) => void;
  chatScrollContainerRef: RefObject<HTMLDivElement | null>;
  registerTaskElement: (taskId: number, element: HTMLDivElement | null) => void;
}

interface DisplaySegmentGroup {
  id: number;
  text: string;
  segments: ChunkSegment[];
}

const normalizeSlashSeparatedText = (text: string) =>
  text
    .replace(/\s*\n\s*\/\s*/g, ' / ')
    .replace(/\s*\/\s*\n\s*/g, ' / ');

const buildDisplaySegmentGroups = (
  segments: ChunkSegment[],
  currentReceivingSegmentId: number | null,
): DisplaySegmentGroup[] =>
  segments
    .filter(
      (segment, index) =>
        segment.text.trim() !== '' ||
        segment.id === currentReceivingSegmentId ||
        index === segments.length - 1,
    )
    .reduce<DisplaySegmentGroup[]>((groups, segment) => {
      const text = normalizeSlashSeparatedText(segment.text);
      const trimmedText = text.trim();
      const previousGroup = groups[groups.length - 1];

      if (previousGroup && /^\//.test(trimmedText)) {
        previousGroup.text = `${previousGroup.text.replace(/\s+$/g, '')} ${trimmedText.replace(/^\/\s*/g, '/ ')}`;
        previousGroup.segments.push(segment);
        return groups;
      }

      groups.push({
        id: segment.id,
        text,
        segments: [segment],
      });
      return groups;
    }, []);

const MarkdownMessage = ({ text }: { text: string }) => (
  <div className="cybercat-markdown min-w-0 flex-1">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node: _node, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer" />
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  </div>
);

const EmptyChatState = ({ selectedSession, sessions }: Pick<ChatListProps, 'selectedSession' | 'sessions'>) => {
  const cyberCatLogoSrc = 'CyberCat.png';
  const message = selectedSession
    ? 'Ask anything and CyberCat will stream the response in real time.'
    : sessions.length > 0
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
};

export const ChatList = ({
  selectedSession,
  sessions,
  playingSegmentId,
  currentReceivingSegmentId,
  playAudio,
  chatScrollContainerRef,
  registerTaskElement,
}: ChatListProps) => {
  const tasks = selectedSession?.tasks ?? [];
  const hasMessages = tasks.length > 0;

  return (
    <div
      ref={chatScrollContainerRef}
      className={
        hasMessages
          ? 'flex flex-1 flex-col gap-3 overflow-auto px-3 pt-3 pb-[240px]'
            : 'flex flex-1 items-center justify-center overflow-auto p-3'
      }
    >
      {!hasMessages ? (
        <EmptyChatState selectedSession={selectedSession} sessions={sessions} />
      ) : (
        tasks.map((task) => (
          <div
            key={task.id}
            ref={(element) => registerTaskElement(task.id, element)}
            className="
              group/task flex flex-col gap-2 rounded-xl bg-white p-3 shadow-xs transition-all

              hover:shadow-sm

              dark:bg-zinc-800
            "
          >
            <div className="flex items-center justify-between pb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-bold text-gray-300">
                  {task.timestamp}
                </span>
              </div>
              {task.segments.some((s) => playingSegmentId === s.id) && (
                <span
                  className="
                    flex items-center gap-1.5 text-[9px] font-bold tracking-tighter text-blue-500
                    uppercase
                  "
                >
                  <Volume2 size={10} className="animate-pulse" />
                  Live Playback
                </span>
              )}
            </div>
            {task.prompt && (
              <div
                className="
                  mb-1 pb-2 text-[11px] leading-relaxed text-gray-400 italic

                  dark:text-gray-500
                "
              >
                {task.prompt}
              </div>
            )}
            <div className="flex flex-col">
              {buildDisplaySegmentGroups(task.segments, currentReceivingSegmentId).map((group) => {
                const isPlaying = group.segments.some((segment) => playingSegmentId === segment.id);
                const playableSegment =
                  group.segments.find(
                    (segment) =>
                      (segment.audioChunks && segment.audioChunks.length > 0) || segment.audioFile,
                  ) ?? group.segments[0];
                const hasAudio = group.segments.some(
                  (segment) =>
                    (segment.audioChunks && segment.audioChunks.length > 0) || segment.audioFile,
                );

                return (
                  <div key={group.id} className="group flex items-center justify-between gap-3">
                    <div
                      className={`
                        flex min-h-[24px] flex-1 text-[13px]/[1.5]
                        transition-colors

                        ${
                          isPlaying
                            ? `
                              text-blue-500

                              dark:text-blue-400
                            `
                            : `
                              text-gray-700

                              dark:text-gray-200
                            `
                        }
                      `}
                    >
                      <MarkdownMessage text={group.text} />
                    </div>
                    {hasAudio && (
                      <Button
                        type="text"
                        size="small"
                        className={`
                          m-0 flex size-6 shrink-0 items-center justify-center border-none p-0
                          transition-all

                          ${
                            isPlaying
                              ? `
                                bg-blue-50 text-blue-500

                                dark:bg-blue-500/10
                              `
                              : `
                                text-gray-300 opacity-0

                                group-hover:opacity-100

                                hover:bg-gray-100 hover:text-gray-600

                                dark:hover:bg-white/10 dark:hover:text-gray-300
                              `
                          }
                        `}
                        icon={
                          isPlaying ? (
                            <Volume2 size={14} className="animate-pulse" />
                          ) : (
                            <Play size={14} />
                          )
                        }
                        onClick={() => playAudio(playableSegment)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
