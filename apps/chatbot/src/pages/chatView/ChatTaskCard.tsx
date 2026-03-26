import { Button } from 'antd';
import { Play, Volume2 } from 'lucide-react';
import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { ChunkSegment, Task } from './types';

interface ChatTaskCardProps {
  currentReceivingSegmentId: number | null;
  playingSegmentId: number | null;
  playAudio: (segment: ChunkSegment) => void;
  registerTaskElement: (taskId: number, element: HTMLDivElement | null) => void;
  task: Task;
}

interface DisplaySegmentGroup {
  id: number;
  text: string;
  segments: ChunkSegment[];
}

const normalizeSlashSeparatedText = (text: string) =>
  text.replace(/\s*\n\s*\/\s*/g, ' / ').replace(/\s*\/\s*\n\s*/g, ' / ');

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

const MarkdownMessage = memo(({ text }: { text: string }) => (
  <div className="cybercat-markdown min-w-0 flex-1">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
      }}
    >
      {text}
    </ReactMarkdown>
  </div>
));

export const ChatTaskCard = memo(
  ({
    currentReceivingSegmentId,
    playingSegmentId,
    playAudio,
    registerTaskElement,
    task,
  }: ChatTaskCardProps) => {
    const displayGroups = useMemo(
      () => buildDisplaySegmentGroups(task.segments, currentReceivingSegmentId),
      [currentReceivingSegmentId, task.segments],
    );

    return (
      <div
        ref={(element) => registerTaskElement(task.id, element)}
        className="
          group/task flex flex-col gap-2 rounded-xl bg-white p-3 shadow-xs transition-all

          hover:shadow-sm

          dark:bg-zinc-800
        "
      >
        <div className="flex items-center justify-between pb-1.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] font-bold text-gray-300">{task.timestamp}</span>
          </div>
          {task.segments.some((segment) => playingSegmentId === segment.id) && (
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
          {displayGroups.map((group) => {
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
                      isPlaying ? <Volume2 size={14} className="animate-pulse" /> : <Play size={14} />
                    }
                    onClick={() => playAudio(playableSegment)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);