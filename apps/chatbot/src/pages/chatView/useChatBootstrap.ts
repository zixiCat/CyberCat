import { useRef } from 'react';
import { useMount, useUnmount } from 'react-use';

import { ensureBackendSignalBindings, formatTimestamp, RETRY_DELAY_MS } from './chatShared';
import { ChatBackendSignalHandlers, ChunkSegment, Session, Task } from './types';

interface UseChatBootstrapOptions {
  ensureActiveSessionId: () => string;
  finalizePendingSegments: () => void;
  handleSegmentFinished: (segmentId: number) => void;
  hydrateSessions: (sessions: Session[]) => void;
  processAudioChunk: (segmentId: number, audioBase64: string) => void;
  reloadProfileSettings: () => Promise<void>;
  scrollChatToBottom: (behavior?: ScrollBehavior) => void;
  scrollTaskToTop: (taskId: number, behavior?: ScrollBehavior) => void;
  setAvailablePrompts: (prompts: string[]) => void;
  setIsTaskRunning: (value: boolean) => void;
  setIsWindowMaximized: (value: boolean) => void;
  setSelectedPromptContent: (content: string) => void;
  setSelectedPromptFile: (file: string) => void;
  updateSessions: (updater: (prev: Session[]) => Session[]) => void;
}

export const useChatBootstrap = ({
  ensureActiveSessionId,
  finalizePendingSegments,
  handleSegmentFinished,
  hydrateSessions,
  processAudioChunk,
  reloadProfileSettings,
  scrollChatToBottom,
  scrollTaskToTop,
  setAvailablePrompts,
  setIsTaskRunning,
  setIsWindowMaximized,
  setSelectedPromptContent,
  setSelectedPromptFile,
  updateSessions,
}: UseChatBootstrapOptions) => {
  const retryTimerRef = useRef<number | null>(null);

  useMount(() => {
    const setupBackendHandlers = () => {
      if (!window.backend) {
        retryTimerRef.current = window.setTimeout(setupBackendHandlers, RETRY_DELAY_MS);
        return;
      }

      const signalHandlers: ChatBackendSignalHandlers = {
        onTaskStarted: (taskId: number, prompt: string) => {
          setIsTaskRunning(true);
          const nowStr = formatTimestamp();

          window.setTimeout(() => {
            const targetSessionId = ensureActiveSessionId();
            updateSessions((prev) =>
              prev.map((session) => {
                if (session.id !== targetSessionId || session.tasks.find((task) => task.id === taskId)) {
                  return session;
                }

                return {
                  ...session,
                  tasks: [...session.tasks, { id: taskId, prompt, segments: [], timestamp: nowStr }],
                };
              }),
            );
            scrollTaskToTop(taskId);
          }, 0);
        },
        onSegmentTextChunk: (segmentId: number, chunk: string) => {
          const taskId = Math.floor(segmentId / 10000);
          updateSessions((prev) =>
            prev.map((session) => {
              const taskExists = session.tasks.some((task) => task.id === taskId);
              if (!taskExists) {
                return session;
              }

              return {
                ...session,
                tasks: session.tasks.map((task) => {
                  if (task.id !== taskId) {
                    return task;
                  }

                  const existingSegment = task.segments.find((segment) => segment.id === segmentId);
                  if (existingSegment) {
                    return {
                      ...task,
                      segments: task.segments.map((segment) =>
                        segment.id === segmentId
                          ? { ...segment, text: (segment.text ?? '') + (chunk ?? '') }
                          : segment,
                      ),
                    };
                  }

                  return {
                    ...task,
                    segments: [...task.segments, { id: segmentId, text: chunk ?? '', audioChunks: [] }],
                  };
                }),
              };
            }),
          );
          scrollChatToBottom('auto');
        },
        onSegmentAudioChunk: (segmentId: number, audioBase64: string) => {
          processAudioChunk(segmentId, audioBase64);
        },
        onSegmentFinished: (segmentId: number) => {
          handleSegmentFinished(segmentId);
        },
        onTaskFinished: () => {
          setIsTaskRunning(false);
          finalizePendingSegments();
        },
        onWindowStateChanged: (maximized: boolean) => {
          setIsWindowMaximized(Boolean(maximized));
        },
      };

      window.cyberCatBackendSignalHandlers = signalHandlers;
      ensureBackendSignalBindings(window.backend);

      void reloadProfileSettings();

      window.backend.get_available_prompts().then((promptsJson: string) => {
        try {
          const prompts = JSON.parse(promptsJson) as string[];
          setAvailablePrompts(prompts);
          if (prompts.length === 0) {
            return;
          }

          const defaultPrompt = prompts.includes('Default.md') ? 'Default.md' : prompts[0];
          setSelectedPromptFile(defaultPrompt);
          window.backend?.get_prompt_content(defaultPrompt).then((content: string) => {
            setSelectedPromptContent(content);
            window.backend?.set_active_system_prompt(content);
          });
        } catch (error) {
          console.error('Failed to parse prompts:', error);
        }
      });

      window.backend.load_sessions().then((sessionsJson: string) => {
        try {
          if (!sessionsJson) {
            hydrateSessions([]);
            return;
          }

          const loadedSessions = JSON.parse(sessionsJson) as Session[];
          const restored = (loadedSessions || []).map((session: Session) => ({
            ...session,
            tasks: (session.tasks || []).map((task: Task) => ({
              ...task,
              segments: (task.segments || []).map((segment: ChunkSegment) => ({
                ...segment,
                audioChunks: segment.audioChunks || [],
                hasAudio: Boolean(segment.audioFile) || Boolean(segment.hasAudio),
              })),
            })),
          }));

          restored.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
          hydrateSessions(restored);
        } catch (error) {
          console.error('Failed to parse sessions:', error);
        }
      });
    };

    setupBackendHandlers();
  });

  useUnmount(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
    }
    window.cyberCatBackendSignalHandlers = {};
  });
};