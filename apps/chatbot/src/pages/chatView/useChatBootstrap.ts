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
import {
  ChatBackendSignalHandlers,
  ChunkSegment,
  FileIngestResult,
  FileIngestStartPayload,
  PromptOption,
  Session,
  Task,
} from './types';

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
  const pendingTextChunksRef = useRef<Map<number, string>>(new Map());
  const pendingTextFlushTimerRef = useRef<number | null>(null);

  const flushPendingTextChunks = () => {
    if (pendingTextFlushTimerRef.current !== null) {
      window.clearTimeout(pendingTextFlushTimerRef.current);
      pendingTextFlushTimerRef.current = null;
    }

    if (pendingTextChunksRef.current.size === ZERO_PROMPTS) {
      return;
    }

    const chunksByTaskId = new Map<number, Array<[number, string]>>();
    pendingTextChunksRef.current.forEach((text, segmentId) => {
      const taskId = Math.floor(segmentId / SEGMENT_TASK_DIVISOR);
      const taskChunks = chunksByTaskId.get(taskId) ?? [];
      taskChunks.push([segmentId, text]);
      chunksByTaskId.set(taskId, taskChunks);
    });
    pendingTextChunksRef.current.clear();

    useChatSessionStore.getState().updateSessions((prev) =>
      prev.map((session) => {
        let sessionChanged = false;
        const nextTasks = session.tasks.map((task) => {
          const pendingTaskChunks = chunksByTaskId.get(task.id);
          if (!pendingTaskChunks || pendingTaskChunks.length === ZERO_PROMPTS) {
            return task;
          }

          let taskChanged = false;
          let nextSegments = task.segments;

          pendingTaskChunks.forEach(([segmentId, chunkText]) => {
            const segmentIndex = nextSegments.findIndex((segment) => segment.id === segmentId);
            if (segmentIndex !== -1) {
              const existingSegment = nextSegments[segmentIndex];
              const nextText = `${existingSegment.text ?? ''}${chunkText ?? ''}`;
              if (nextText === existingSegment.text) {
                return;
              }

              if (!taskChanged) {
                nextSegments = [...task.segments];
              }

              nextSegments[segmentIndex] = {
                ...existingSegment,
                text: nextText,
              };
              taskChanged = true;
              return;
            }

            if (!taskChanged) {
              nextSegments = [...task.segments];
            }

            nextSegments.push({ id: segmentId, text: chunkText ?? '', audioChunks: [] });
            taskChanged = true;
          });

          if (!taskChanged) {
            return task;
          }

          sessionChanged = true;
          return {
            ...task,
            segments: nextSegments,
          };
        });

        if (!sessionChanged) {
          return session;
        }

        return {
          ...session,
          tasks: nextTasks,
        };
      }),
    );
  };

  const queueTextChunk = (segmentId: number, chunk: string) => {
    const existingText = pendingTextChunksRef.current.get(segmentId) ?? '';
    pendingTextChunksRef.current.set(segmentId, `${existingText}${chunk ?? ''}`);

    if (pendingTextFlushTimerRef.current !== null) {
      return;
    }

    pendingTextFlushTimerRef.current = window.setTimeout(() => {
      flushPendingTextChunks();
    }, ZERO_DELAY_MS);
  };

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
            flushPendingTextChunks();
            scrollTaskToTop(taskId);
          }, ZERO_DELAY_MS);
        },
        onSegmentTextChunk: (segmentId: number, chunk: string) => {
          queueTextChunk(segmentId, chunk);
        },
        onSegmentAudioChunk: (segmentId: number, audioBase64: string) => {
          processAudioChunk(segmentId, audioBase64);
        },
        onSegmentFinished: (segmentId: number) => {
          handleSegmentFinished(segmentId);
        },
        onTaskFinished: () => {
          flushPendingTextChunks();
          useChatUiStore.getState().setUiState({ isTaskRunning: false });
          finalizePendingSegments();
        },
        onFileIngestStarted: (payloadJson: string) => {
          try {
            const payload = parseBackendJson<FileIngestStartPayload>(
              payloadJson,
              'File ingest start',
            );
            useChatUiStore.getState().setUiState({
              isFileIngestRunning: true,
              pendingFileIngestSourceCount: Math.max(0, payload.sourceCount || 0),
              lastFileIngestResult: null,
            });
          } catch (error) {
            console.error('Failed to parse file ingest start payload:', error);
            useChatUiStore.getState().setUiState({
              isFileIngestRunning: true,
              pendingFileIngestSourceCount: 0,
              lastFileIngestResult: null,
            });
          }
        },
        onFileIngestFinished: (payloadJson: string) => {
          try {
            const result = parseBackendJson<FileIngestResult>(payloadJson, 'File ingest result');
            useChatUiStore.getState().setUiState({
              isFileIngestRunning: false,
              pendingFileIngestSourceCount: 0,
              lastFileIngestResult: result,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid file ingest result.';
            console.error('Failed to parse file ingest result payload:', error);
            useChatUiStore.getState().setUiState({
              isFileIngestRunning: false,
              pendingFileIngestSourceCount: 0,
              lastFileIngestResult: {
                ok: false,
                jobId: '',
                error: message,
              },
            });
          }
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
    flushPendingTextChunks();
    window.cyberCatBackendSignalHandlers = {};
  });
};