import { useRef } from 'react';
import { useMount, useUnmount } from 'react-use';

import { loadBackendJson, parseBackendJson, waitForBackend } from '../backendShared';
import {
  ensureBackendSignalBindings,
  formatTimestamp,
  RETRY_DELAY_MS,
  SEGMENT_TASK_DIVISOR,
} from './chatShared';
import { useChatSessionStore } from './chatSessionStore';
import { useChatUiStore } from './chatUiStore';
import { ChatBackendSignalHandlers, ChunkSegment, PromptOption, Session, Task } from './types';

const ZERO_DELAY_MS = 0;
const ZERO_PROMPTS = 0;

interface UseChatBootstrapOptions {
  finalizePendingSegments: () => void;
  handleSegmentFinished: (segmentId: number) => void;
  processAudioChunk: (segmentId: number, audioBase64: string) => void;
  reloadProfileSettings: () => Promise<void>;
  scrollTaskToTop: (taskId: number, behavior?: ScrollBehavior) => void;
}

export const useChatBootstrap = ({
  finalizePendingSegments,
  handleSegmentFinished,
  processAudioChunk,
  reloadProfileSettings,
  scrollTaskToTop,
}: UseChatBootstrapOptions) => {
  const cancelledRef = useRef(false);

  useMount(() => {
    cancelledRef.current = false;

    const setupBackendHandlers = async () => {
      const backend = await waitForBackend({
        retryDelayMs: RETRY_DELAY_MS,
        isCancelled: () => cancelledRef.current,
      });

      if (!backend) {
        return;
      }

      const signalHandlers: ChatBackendSignalHandlers = {
        onTaskStarted: (taskId: number, prompt: string) => {
          useChatUiStore.getState().setUiState({ isTaskRunning: true });
          const nowStr = formatTimestamp();

          window.setTimeout(() => {
            const targetSessionId = useChatSessionStore.getState().ensureActiveSessionId();
            useChatSessionStore.getState().updateSessions((prev) =>
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
          }, ZERO_DELAY_MS);
        },
        onSegmentTextChunk: (segmentId: number, chunk: string) => {
          const taskId = Math.floor(segmentId / SEGMENT_TASK_DIVISOR);
          useChatSessionStore.getState().updateSessions((prev) =>
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
        },
        onSegmentAudioChunk: (segmentId: number, audioBase64: string) => {
          processAudioChunk(segmentId, audioBase64);
        },
        onSegmentFinished: (segmentId: number) => {
          handleSegmentFinished(segmentId);
        },
        onTaskFinished: () => {
          useChatUiStore.getState().setUiState({ isTaskRunning: false });
          finalizePendingSegments();
        },
        onWindowStateChanged: (maximized: boolean) => {
          useChatUiStore.getState().setUiState({ isWindowMaximized: Boolean(maximized) });
        },
      };

      window.cyberCatBackendSignalHandlers = signalHandlers;
      ensureBackendSignalBindings(backend);

      void reloadProfileSettings();

      const [promptsResult, sessionsResult] = await Promise.allSettled([
        loadBackendJson<PromptOption[]>(() => backend.get_available_prompts?.(), 'Available prompts'),
        backend.load_sessions ? backend.load_sessions() : Promise.resolve(''),
      ]);

      if (promptsResult.status === 'fulfilled') {
        const prompts = promptsResult.value;
        if (!cancelledRef.current) {
          useChatUiStore.getState().setUiState({ availablePrompts: prompts });
          if (prompts.length === ZERO_PROMPTS) {
            return;
          }

          const defaultPrompt = prompts.find((p) => p.file === 'Default.md') ?? prompts[0];
          useChatUiStore.getState().setUiState({ selectedPromptFile: defaultPrompt.file });
          backend
            .get_prompt_content?.(defaultPrompt.file)
            .then((content: string) => {
              if (cancelledRef.current) {
                return;
              }

              useChatUiStore.getState().setUiState({ selectedPromptContent: content });
              backend.set_active_system_prompt?.(content);
            })
            .catch((error: unknown) => {
              console.error('Failed to load the default prompt content:', error);
            });
        }
      } else {
        console.error('Failed to load prompts:', promptsResult.reason);
      }

      if (sessionsResult.status === 'fulfilled') {
        try {
          const sessionsJson = sessionsResult.value;
          if (!sessionsJson) {
            useChatSessionStore.getState().hydrateSessions([]);
            return;
          }

          const loadedSessions = parseBackendJson<Session[]>(sessionsJson, 'Chat sessions');
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
          if (!cancelledRef.current) {
            useChatSessionStore.getState().hydrateSessions(restored);
          }
        } catch (error) {
          console.error('Failed to parse sessions:', error);
        }
      } else {
        console.error('Failed to load sessions:', sessionsResult.reason);
      }
    };

    void setupBackendHandlers();
  });

  useUnmount(() => {
    cancelledRef.current = true;
    window.cyberCatBackendSignalHandlers = {};
  });
};