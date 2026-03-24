import { useEffect, useRef, useState } from 'react';
import { useMount, useUnmount } from 'react-use';

import { useTheme } from '../App';
import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { ChatList } from './ChatList';
import { Sidebar } from './Sidebar';
import { ChatBackendSignalHandlers, ChunkSegment, Session, Task, VoiceOption } from './types';

const AUDIO_SAMPLE_RATE = 24000;
const AUDIO_CHANNELS = 1;
const AUDIO_CHANNEL_INDEX = 0;
const EMPTY_LENGTH = 0;
const PCM_MAX = 32768.0;
const RETRY_DELAY_MS = 100;
const SESSION_SAVE_DELAY_MS = 250;
const MESSAGE_INPUT_ID = 'chat-message-input';
const THINKING_FIELD_KEY = 'openai_enable_thinking';

const isThinkingSupportedForModel = (modelName: string) => modelName.trim().toLowerCase().includes('qwen');

const parseStoredVoicePool = (rawValue: string | boolean | undefined) =>
  typeof rawValue === 'string'
    ? rawValue
        .split(',')
        .map((voice) => voice.trim())
        .filter(Boolean)
    : [];

const ensureBackendSignalBindings = (backend: NonNullable<Window['backend']>) => {
  if (window.cyberCatBackendSignalsBound) {
    return;
  }

  window.cyberCatBackendSignalsBound = true;

  backend.task_started.connect((taskId: number, prompt: string) => {
    window.cyberCatBackendSignalHandlers?.onTaskStarted?.(taskId, prompt);
  });
  backend.segment_text_chunk.connect((segmentId: number, chunk: string) => {
    window.cyberCatBackendSignalHandlers?.onSegmentTextChunk?.(segmentId, chunk);
  });
  backend.segment_audio_chunk.connect((segmentId: number, audioBase64: string) => {
    window.cyberCatBackendSignalHandlers?.onSegmentAudioChunk?.(segmentId, audioBase64);
  });
  backend.segment_finished.connect((segmentId: number) => {
    window.cyberCatBackendSignalHandlers?.onSegmentFinished?.(segmentId);
  });
  backend.task_finished.connect(() => {
    window.cyberCatBackendSignalHandlers?.onTaskFinished?.();
  });
  backend.window_state_changed?.connect((maximized: boolean) => {
    window.cyberCatBackendSignalHandlers?.onWindowStateChanged?.(maximized);
  });
};

const formatTimestamp = (date: Date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y} ${m} ${d} ${h}:${min}:${s}`;
};

const generateSessionId = () => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return `chatbot_${y}${m}${d}_${h}${min}${s}_${random}`;
};

const stripTransientSessionData = (session: Session) => ({
  ...session,
  tasks: (session.tasks || []).map((task) => ({
    ...task,
    segments: (task.segments || []).map((segment) => ({
      ...segment,
      audioChunks: [],
    })),
  })),
});

const buildSessionHistory = (session: Session | undefined) =>
  (session?.tasks ?? []).flatMap((task) => {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const prompt = task.prompt.trim();
    const response = task.segments
      .map((segment) => segment.text ?? '')
      .join('')
      .trim();

    if (prompt) {
      messages.push({ role: 'user', content: prompt });
    }

    if (response) {
      messages.push({ role: 'assistant', content: response });
    }

    return messages;
  });

export const ChatView = () => {
  const { theme, setTheme } = useTheme();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [availablePrompts, setAvailablePrompts] = useState<string[]>([]);
  const [selectedPromptFile, setSelectedPromptFile] = useState<string>('Default.md');
  const [selectedPromptContent, setSelectedPromptContent] = useState<string>('');
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('auto');
  const [randomVoicePool, setRandomVoicePool] = useState<string[]>([]);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [playingSegmentId, setPlayingSegmentId] = useState<number | null>(null);
  const [isTaskRunning, setIsTaskRunning] = useState<boolean>(false);
  const [autoPlay, setAutoPlay] = useState<boolean>(
    () => localStorage.getItem('autoPlay') !== 'false',
  );
  const [inputText, setInputText] = useState('');
  const [thinkingEnabled, setThinkingEnabledState] = useState(false);
  const [thinkingSupported, setThinkingSupported] = useState(false);

  const autoPlayRef = useRef(autoPlay);
  const autoPlayedSegmentsRef = useRef<Set<number>>(new Set());
  const audioQueueRef = useRef<number[]>([]);
  const isAutoPlayingRef = useRef<boolean>(false);
  const currentReceivingSegmentIdRef = useRef<number | null>(null);
  const segmentAudioChunksRef = useRef<Map<number, Float32Array[]>>(new Map());
  const pendingAudioBase64ChunksRef = useRef<Map<number, string[]>>(new Map());
  const pendingSessionSaveIdsRef = useRef<Set<string>>(new Set());
  const sessionSaveTimerRef = useRef<number | null>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const taskElementRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pendingTaskScrollIdRef = useRef<number | null>(null);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
    localStorage.setItem('autoPlay', String(autoPlay));
  }, [autoPlay]);

  const setThinkingEnabled = (enabled: boolean) => {
    const previousEnabled = thinkingEnabled;
    const nextEnabled = Boolean(enabled && thinkingSupported);
    setThinkingEnabledState(nextEnabled);

    const backend = window.backend;
    if (!backend?.save_settings) {
      return;
    }

    backend
      .save_settings(JSON.stringify({ [THINKING_FIELD_KEY]: nextEnabled }))
      .then((resultJson: string) => {
        const result = JSON.parse(resultJson);
        if (!result.ok) {
          throw new Error(result.error || 'Failed to update thinking mode.');
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to update thinking mode:', error);
        setThinkingEnabledState(previousEnabled);
      });
  };

  const sessionsRef = useRef<Session[]>(sessions);
  const selectedSessionIdRef = useRef<string | null>(selectedSessionId);

  const reloadProfileSettings = async () => {
    const backend = window.backend;
    if (!backend?.get_settings || !backend.get_active_voice || !backend.get_voice_options) {
      return;
    }

    try {
      const [settingsJson, voice, voiceOptionsJson] = await Promise.all([
        backend.get_settings(),
        backend.get_active_voice(),
        backend.get_voice_options(),
      ]);

      const settings = JSON.parse(settingsJson) as Record<string, string | boolean>;
      const parsedVoiceOptions = JSON.parse(voiceOptionsJson) as VoiceOption[];
      const modelName = typeof settings.openai_model === 'string' ? settings.openai_model : '';
      const storedRandomVoicePool = parseStoredVoicePool(settings.random_voice_pool);
      const supported = isThinkingSupportedForModel(modelName);

      setVoiceOptions(parsedVoiceOptions);
      setSelectedVoice(voice || 'auto');
      setRandomVoicePool(storedRandomVoicePool);
      setThinkingSupported(supported);
      setThinkingEnabledState(supported && Boolean(settings[THINKING_FIELD_KEY]));
    } catch (error) {
      console.error('Failed to reload profile settings:', error);
    }
  };

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;

    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[sessions.length - 1].id);
      return;
    }

    const session = sessions.find((s) => s.id === selectedSessionId);
    if (session?.systemPromptFile && session.systemPromptFile !== selectedPromptFile) {
      setSelectedPromptFile(session.systemPromptFile);
      window.backend?.get_prompt_content(session.systemPromptFile).then((content: string) => {
        setSelectedPromptContent(content);
        window.backend?.set_active_system_prompt(content);
      });
    }
  }, [selectedSessionId, sessions]);

  const focusMessageInput = () => {
    const messageInput = document.getElementById(MESSAGE_INPUT_ID) as HTMLTextAreaElement | null;
    if (!messageInput || messageInput.disabled) {
      return;
    }

    window.requestAnimationFrame(() => {
      messageInput.focus({ preventScroll: true });
      const cursorPosition = messageInput.value.length;
      messageInput.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

  const scrollChatToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const container = chatScrollContainerRef.current;
    if (!container) {
      return;
    }

    window.requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
    });
  };

  const scrollTaskToTop = (taskId: number, behavior: ScrollBehavior = 'smooth') => {
    const container = chatScrollContainerRef.current;
    const taskElement = taskElementRefs.current.get(taskId);
    if (!container || !taskElement) {
      pendingTaskScrollIdRef.current = taskId;
      return;
    }

    pendingTaskScrollIdRef.current = null;
    window.requestAnimationFrame(() => {
      const containerPaddingTop = Number.parseFloat(window.getComputedStyle(container).paddingTop) || 0;
      container.scrollTo({
        top: Math.max(0, taskElement.offsetTop - containerPaddingTop),
        behavior,
      });
    });
  };

  const registerTaskElement = (taskId: number, element: HTMLDivElement | null) => {
    if (element) {
      taskElementRefs.current.set(taskId, element);
      if (pendingTaskScrollIdRef.current === taskId) {
        scrollTaskToTop(taskId, 'auto');
      }
      return;
    }

    taskElementRefs.current.delete(taskId);
  };

  const playAudio = async (segment: ChunkSegment) => {
    const ctx = audioContext.current;
    if (!ctx) return;

    return new Promise<void>((resolve) => {
      if (currentSourceRef.current) {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      }

      setPlayingSegmentId(segment.id);

      const streamedChunks = segmentAudioChunksRef.current.get(segment.id) ?? segment.audioChunks;

      if (streamedChunks && streamedChunks.length > 0) {
        const totalLength = streamedChunks.reduce(
          (acc, chunk) => acc + chunk.length,
          EMPTY_LENGTH,
        );
        const combinedArray = new Float32Array(totalLength);

        let offset = EMPTY_LENGTH;
        for (const chunk of streamedChunks) {
          combinedArray.set(chunk, offset);
          offset += chunk.length;
        }

        const audioBuffer = ctx.createBuffer(AUDIO_CHANNELS, totalLength, AUDIO_SAMPLE_RATE);
        audioBuffer.getChannelData(AUDIO_CHANNEL_INDEX).set(combinedArray);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
          setPlayingSegmentId(null);
          resolve();
        };
        source.start();
        currentSourceRef.current = source;
      } else if (segment.audioFile && window.backend) {
        window.backend
          .get_audio_file(segment.audioFile)
          .then(async (base64Wav: string) => {
            if (base64Wav && audioContext.current) {
              const binaryString = window.atob(base64Wav);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.onended = () => {
                setPlayingSegmentId(null);
                resolve();
              };
              source.start();
              currentSourceRef.current = source;
            } else {
              setPlayingSegmentId(null);
              resolve();
            }
          })
          .catch((e: any) => {
            console.error('Failed to play audio file:', e);
            setPlayingSegmentId(null);
            resolve();
          });
      } else {
        setPlayingSegmentId(null);
        resolve();
      }
    });
  };

  const processAudioQueue = async () => {
    if (isAutoPlayingRef.current || audioQueueRef.current.length === 0) return;
    isAutoPlayingRef.current = true;

    while (audioQueueRef.current.length > 0) {
      const segmentId = audioQueueRef.current.shift();
      if (segmentId !== undefined) {
        const allSegments = sessionsRef.current.flatMap((s) => s.tasks.flatMap((t) => t.segments));
        const targetSeg = allSegments.find((s) => s.id === segmentId);
        if (targetSeg) {
          await playAudio(targetSeg);
        }
      }
    }

    isAutoPlayingRef.current = false;
  };

  const flushPendingSessionSaves = () => {
    sessionSaveTimerRef.current = null;

    if (!window.backend || pendingSessionSaveIdsRef.current.size === 0) {
      pendingSessionSaveIdsRef.current.clear();
      return;
    }

    const sessionsById = new Map(sessionsRef.current.map((session) => [session.id, session]));

    pendingSessionSaveIdsRef.current.forEach((sessionId) => {
      const session = sessionsById.get(sessionId);
      if (!session) return;

      try {
        window.backend?.save_session(session.id, JSON.stringify(stripTransientSessionData(session)));
      } catch (error) {
        console.error('Failed to save session:', error);
      }
    });

    pendingSessionSaveIdsRef.current.clear();
  };

  const scheduleSessionSave = (sessionIds: string[]) => {
    for (const sessionId of sessionIds) {
      pendingSessionSaveIdsRef.current.add(sessionId);
    }

    if (sessionSaveTimerRef.current !== null) {
      window.clearTimeout(sessionSaveTimerRef.current);
    }

    sessionSaveTimerRef.current = window.setTimeout(flushPendingSessionSaves, SESSION_SAVE_DELAY_MS);
  };

  const finalizeSegmentAudio = (segmentId: number) => {
    const chunks = pendingAudioBase64ChunksRef.current.get(segmentId);
    if (!chunks || chunks.length === 0) return;

    pendingAudioBase64ChunksRef.current.delete(segmentId);

    if (!window.backend) return;

    window.backend
      .save_audio_chunks(JSON.stringify(chunks))
      .then((filename: string) => {
        if (!filename) return;

        const taskId = Math.floor(segmentId / 10000);
        updateSessions((prev) =>
          prev.map((session) => {
            const taskIndex = session.tasks.findIndex((task) => task.id === taskId);
            if (taskIndex === -1) return session;

            const task = session.tasks[taskIndex];
            const segmentIndex = task.segments.findIndex((segment) => segment.id === segmentId);
            if (segmentIndex === -1) return session;

            const targetSegment = task.segments[segmentIndex];
            if (targetSegment.audioFile === filename && targetSegment.hasAudio) {
              return session;
            }

            const nextSegments = [...task.segments];
            nextSegments[segmentIndex] = {
              ...targetSegment,
              audioFile: filename,
              hasAudio: true,
            };

            const nextTasks = [...session.tasks];
            nextTasks[taskIndex] = { ...task, segments: nextSegments };

            return { ...session, tasks: nextTasks };
          }),
        );
      })
      .catch((error: unknown) => {
        console.error('Failed to finalize audio segment:', error);
      });
  };

  const updateSessions = (updater: (prev: Session[]) => Session[]) => {
    setSessions((prev) => {
      const next = updater(prev);
      const previousSessionsById = new Map(prev.map((session) => [session.id, session]));
      const changedSessionIds = next
        .filter((session) => previousSessionsById.get(session.id) !== session)
        .map((session) => session.id);

      const hasSameOrder =
        next.length === prev.length && next.every((session, index) => session === prev[index]);

      if (changedSessionIds.length === 0 && hasSameOrder) {
        return prev;
      }

      const sorted = [...next].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
      sessionsRef.current = sorted;

      if (changedSessionIds.length > 0) {
        scheduleSessionSave(changedSessionIds);
      }

      return sorted;
    });
  };

  const clearCurrentChat = () => {
    if (selectedSessionId !== null) {
      window.backend?.delete_session(selectedSessionId);
      updateSessions((prev) => prev.filter((s) => s.id !== selectedSessionId));
      setSelectedSessionId(null);
    }
  };

  const createSession = () => {
    const newId = generateSessionId();
    const newSession: Session = {
      id: newId,
      timestamp: formatTimestamp(),
      tasks: [],
      systemPromptFile: selectedPromptFile,
    };

    updateSessions((prev) => [...prev, newSession]);
    selectedSessionIdRef.current = newId;
    setSelectedSessionId(newId);

    return newSession;
  };

  const ensureActiveSessionId = () => {
    const activeSessionId = selectedSessionIdRef.current;
    if (activeSessionId && sessionsRef.current.some((session) => session.id === activeSessionId)) {
      return activeSessionId;
    }

    return createSession().id;
  };

  const stopStreaming = () => {
    window.backend?.stop_task();
    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
      currentSourceRef.current.disconnect();
      currentSourceRef.current = null;
    }
    setPlayingSegmentId(null);
    audioQueueRef.current = [];
    isAutoPlayingRef.current = false;
    setIsTaskRunning(false);
  };

  const handleSendMessage = () => {
    if (!inputText.trim() || isTaskRunning) return;

    if (window.backend) {
      const targetSessionId = ensureActiveSessionId();
      const targetSession = sessionsRef.current.find((session) => session.id === targetSessionId);
      const historyJson = JSON.stringify(buildSessionHistory(targetSession));

      window.backend.start_task(inputText, selectedPromptContent, historyJson);
      setInputText('');
      scrollChatToBottom('smooth');
    } else {
      console.warn('Backend not connected');
    }
  };

  const createNewSession = () => {
    createSession();
  };

  const startWindowDrag = () => {
    window.backend?.start_drag?.();
  };

  const minimizeWindow = () => {
    window.backend?.minimize_window?.();
  };

  const toggleMaximizeWindow = () => {
    window.backend?.maximize_window?.();
  };

  const closeWindow = () => {
    window.backend?.close_window?.();
  };

  useEffect(() => {
    const isAppRuntime = () => Boolean(window.qt?.webChannelTransport);

    const handleWindowActivated = () => {
      if (!isAppRuntime()) {
        return;
      }

      window.setTimeout(focusMessageInput, 0);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleWindowActivated();
      }
    };

    const handleNewSessionShortcut = (event: KeyboardEvent) => {
      if (!isAppRuntime()) {
        return;
      }

      if (!event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      if (event.key.toLowerCase() !== 'l') {
        return;
      }

      event.preventDefault();
      createNewSession();
      window.setTimeout(focusMessageInput, 0);
    };

    window.addEventListener('focus', handleWindowActivated);
    window.addEventListener('keydown', handleNewSessionShortcut);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    handleWindowActivated();

    return () => {
      window.removeEventListener('focus', handleWindowActivated);
      window.removeEventListener('keydown', handleNewSessionShortcut);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [createNewSession]);

  const processAudioChunk = (segmentId: number, base64Audio: string) => {
    if (!audioContext.current) return;
    const taskId = Math.floor(segmentId / 10000);
    try {
      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = EMPTY_LENGTH; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = EMPTY_LENGTH; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / PCM_MAX;
      }
      const existingChunks = segmentAudioChunksRef.current.get(segmentId) ?? [];
      existingChunks.push(float32Array);
      segmentAudioChunksRef.current.set(segmentId, existingChunks);

      const pendingChunks = pendingAudioBase64ChunksRef.current.get(segmentId) ?? [];
      pendingChunks.push(base64Audio);
      pendingAudioBase64ChunksRef.current.set(segmentId, pendingChunks);

      currentReceivingSegmentIdRef.current = segmentId;

      updateSessions((prev) =>
        prev.map((session) => {
          const taskIndex = session.tasks.findIndex((task) => task.id === taskId);
          if (taskIndex === -1) return session;

          const task = session.tasks[taskIndex];
          const segmentIndex = task.segments.findIndex((segment) => segment.id === segmentId);

          if (segmentIndex !== -1) {
            const targetSegment = task.segments[segmentIndex];
            if (targetSegment.hasAudio) {
              return session;
            }

            const nextSegments = [...task.segments];
            nextSegments[segmentIndex] = { ...targetSegment, hasAudio: true };

            const nextTasks = [...session.tasks];
            nextTasks[taskIndex] = { ...task, segments: nextSegments };

            return { ...session, tasks: nextTasks };
          }

          const nextTasks = [...session.tasks];
          nextTasks[taskIndex] = {
            ...task,
            segments: [...task.segments, { id: segmentId, text: '', hasAudio: true }],
          };

          return { ...session, tasks: nextTasks };
        }),
      );
    } catch (error) {
      console.error('Error processing audio chunk:', error);
    }
  };

  useMount(() => {
    audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const setupBackendHandlers = () => {
      if (!window.backend) {
        setTimeout(setupBackendHandlers, RETRY_DELAY_MS);
        return;
      }
      const signalHandlers: ChatBackendSignalHandlers = {
        onTaskStarted: (taskId: number, prompt: string) => {
          setIsTaskRunning(true);
          const nowStr = formatTimestamp();

          setTimeout(() => {
            const targetSessionId = ensureActiveSessionId();
            updateSessions((prev) => {
              return prev.map((session) => {
                if (session.id === targetSessionId) {
                  if (session.tasks.find((t) => t.id === taskId)) return session;
                  return {
                    ...session,
                    tasks: [...session.tasks, { id: taskId, prompt, segments: [], timestamp: nowStr }],
                  };
                }
                return session;
              });
            });
            scrollTaskToTop(taskId);
          }, 0);
        },
        onSegmentTextChunk: (segmentId: number, chunk: string) => {
          const taskId = Math.floor(segmentId / 10000);
          updateSessions((prev) => {
            return prev.map((session) => {
              const taskExists = session.tasks.some((t) => t.id === taskId);
              if (taskExists) {
                return {
                  ...session,
                  tasks: session.tasks.map((t) => {
                    if (t.id === taskId) {
                      const seg = t.segments.find((s) => s.id === segmentId);
                      if (seg) {
                        return {
                          ...t,
                          segments: t.segments.map((s) =>
                            s.id === segmentId ? { ...s, text: (s.text ?? '') + (chunk ?? '') } : s,
                          ),
                        };
                      }
                      return {
                        ...t,
                        segments: [...t.segments, { id: segmentId, text: chunk ?? '', audioChunks: [] }],
                      };
                    }
                    return t;
                  }),
                };
              }
              return session;
            });
          });
          scrollChatToBottom('auto');
        },
        onSegmentAudioChunk: (segmentId: number, audioBase64: string) => {
          processAudioChunk(segmentId, audioBase64);
        },
        onSegmentFinished: (segmentId: number) => {
          currentReceivingSegmentIdRef.current = null;
          finalizeSegmentAudio(segmentId);

          if (autoPlayRef.current && !autoPlayedSegmentsRef.current.has(segmentId)) {
            autoPlayedSegmentsRef.current.add(segmentId);
            audioQueueRef.current.push(segmentId);
            processAudioQueue();
          }
        },
        onTaskFinished: () => {
          setIsTaskRunning(false);
          currentReceivingSegmentIdRef.current = null;
          pendingAudioBase64ChunksRef.current.forEach((_, segmentId) => {
            finalizeSegmentAudio(segmentId);
          });
        },
        onWindowStateChanged: (maximized: boolean) => {
          setIsWindowMaximized(Boolean(maximized));
        },
      };

      window.cyberCatBackendSignalHandlers = signalHandlers;
      ensureBackendSignalBindings(window.backend);

                void reloadProfileSettings();
                const backend = window.backend;
                if (!backend) {
                  return;
                }

                backend.get_available_prompts().then((promptsJson: string) => {
                  try {
                    const prompts = JSON.parse(promptsJson);
                    setAvailablePrompts(prompts);
                    if (prompts.length > 0) {
                      const defaultPrompt = prompts.includes('Default.md')
                        ? 'Default.md'
                        : prompts[0];
                      setSelectedPromptFile(defaultPrompt);
                      backend.get_prompt_content(defaultPrompt).then((content: string) => {
                        setSelectedPromptContent(content);
                        backend.set_active_system_prompt(content);
                      });
                    }
                  } catch (e) {
                    console.error('Failed to parse prompts:', e);
                  }
                });
                backend.load_sessions().then((sessionsJson: string) => {
                  try {
                    if (!sessionsJson) return;
                    const loadedSessions = JSON.parse(sessionsJson);
                    const restored = (loadedSessions || []).map((session: Session) => ({
                      ...session,
                      tasks: (session.tasks || []).map((task: Task) => ({
                        ...task,
                        segments: (task.segments || []).map((seg: ChunkSegment) => ({
                          ...seg,
                          audioChunks: (seg as any).audioChunks || [],
                          hasAudio: Boolean(seg.audioFile) || Boolean(seg.hasAudio),
                        })),
                      })),
                    }));
                    restored.sort((a: Session, b: Session) =>
                      (a.timestamp || '').localeCompare(b.timestamp || ''),
                    );
                    setSessions(restored);
                    sessionsRef.current = restored;
                    if (restored.length > 0) {
                      setSelectedSessionId(restored[restored.length - 1].id);
                    }
                  } catch (e) {
                    console.error('Failed to parse sessions:', e);
                  }
                });
    };
    setupBackendHandlers();
  });

  useUnmount(() => {
    window.cyberCatBackendSignalHandlers = {};

    if (sessionSaveTimerRef.current !== null) {
      window.clearTimeout(sessionSaveTimerRef.current);
      flushPendingSessionSaves();
    }

    if (audioContext.current) {
      audioContext.current.close();
    }
  });

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  return (
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
            currentReceivingSegmentId={currentReceivingSegmentIdRef.current}
            playAudio={playAudio}
            chatScrollContainerRef={chatScrollContainerRef}
            registerTaskElement={registerTaskElement}
          />
          <ChatInput
            inputText={inputText}
            setInputText={setInputText}
            isTaskRunning={isTaskRunning}
            handleSendMessage={handleSendMessage}
            inputId={MESSAGE_INPUT_ID}
            thinkingEnabled={thinkingEnabled}
            thinkingSupported={thinkingSupported}
            setThinkingEnabled={setThinkingEnabled}
          />
        </div>
      </div>
    </div>
  );
};
