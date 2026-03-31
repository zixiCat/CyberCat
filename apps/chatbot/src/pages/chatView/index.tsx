import { useCallback, useEffect, useRef } from 'react';

import { loadBackendJson } from '../backendShared';
import {
  buildSessionHistory,
  isThinkingSupportedForModel,
  MESSAGE_INPUT_ID,
  parseStoredVoicePool,
  THINKING_FIELD_KEY,
} from './chatShared';
import { useChatUiStore } from './chatUiStore';
import { ChatViewLayout } from './ChatViewLayout';
import { VoiceOption } from './types';
import { useChatAudio } from './useChatAudio';
import { useChatBootstrap } from './useChatBootstrap';
import { useChatSessions } from './useChatSessions';
import { useDesktopMessageInputFocus } from './useDesktopMessageInputFocus';

const ZERO_OFFSET = 0;
const DEFAULT_CHAT_SCROLL_PADDING_BOTTOM = 240;

interface SaveSettingsResult {
  ok: boolean;
  error?: string;
}

export const ChatView = () => {
  const selectedPromptFile = useChatUiStore((state) => state.selectedPromptFile);
  const selectedPromptContent = useChatUiStore((state) => state.selectedPromptContent);
  const isTaskRunning = useChatUiStore((state) => state.isTaskRunning);
  const setUiState = useChatUiStore((state) => state.setUiState);
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const taskElementRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pendingTaskScrollIdRef = useRef<number | null>(null);
  const {
    sessions,
    selectedSessionId,
    createNewSession,
    ensureActiveSessionId,
  } = useChatSessions();
  const {
    playAudio,
    processAudioChunk,
    handleSegmentFinished,
    finalizePendingSegments,
    stopAudioPlayback,
  } = useChatAudio();

  const setThinkingEnabled = useCallback((enabled: boolean) => {
    const { thinkingEnabled, thinkingSupported } = useChatUiStore.getState();
    const previousEnabled = thinkingEnabled;
    const nextEnabled = Boolean(enabled && thinkingSupported);
    setUiState({ thinkingEnabled: nextEnabled });

    const backend = window.backend;
    if (!backend?.save_settings) {
      return;
    }

    loadBackendJson<SaveSettingsResult>(
      () => backend.save_settings?.(JSON.stringify({ [THINKING_FIELD_KEY]: nextEnabled })),
      'Thinking mode settings',
    )
      .then((result) => {
        if (!result.ok) {
          throw new Error(result.error || 'Failed to update thinking mode.');
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to update thinking mode:', error);
        setUiState({ thinkingEnabled: previousEnabled });
      });
  }, [setUiState]);

  const reloadProfileSettings = useCallback(async () => {
    const backend = window.backend;
    if (!backend?.get_settings || !backend.get_active_voice || !backend.get_voice_options) {
      return;
    }

    try {
      const [settings, voice, parsedVoiceOptions] = await Promise.all([
        loadBackendJson<Record<string, string | boolean>>(
          () => backend.get_settings?.(),
          'Profile settings',
        ),
        backend.get_active_voice(),
        loadBackendJson<VoiceOption[]>(() => backend.get_voice_options?.(), 'Voice options'),
      ]);

      const modelName = typeof settings.openai_model === 'string' ? settings.openai_model : '';
      const storedRandomVoicePool = parseStoredVoicePool(settings.random_voice_pool);
      const supported = isThinkingSupportedForModel(modelName);

      setUiState({
        voiceOptions: parsedVoiceOptions,
        selectedVoice: voice || 'auto',
        randomVoicePool: storedRandomVoicePool,
        thinkingSupported: supported,
        thinkingEnabled: supported && Boolean(settings[THINKING_FIELD_KEY]),
      });
    } catch (error) {
      console.error('Failed to reload profile settings:', error);
    }
  }, [setUiState]);

  useEffect(() => {
    const session = sessions.find((s) => s.id === selectedSessionId);
    const backend = window.backend;
    if (!session?.systemPromptFile || session.systemPromptFile === selectedPromptFile || !backend?.get_prompt_content) {
      return;
    }

    setUiState({ selectedPromptFile: session.systemPromptFile });
    backend
      .get_prompt_content(session.systemPromptFile)
      .then((content: string) => {
        setUiState({ selectedPromptContent: content });
        backend.set_active_system_prompt?.(content);
      })
      .catch((error: unknown) => {
        console.error('Failed to sync the session prompt:', error);
      });
  }, [selectedPromptFile, selectedSessionId, sessions, setUiState]);

  const scrollTaskToTop = useCallback((taskId: number, behavior: ScrollBehavior = 'smooth') => {
    const container = chatScrollContainerRef.current;
    const taskElement = taskElementRefs.current.get(taskId);
    if (!container || !taskElement) {
      pendingTaskScrollIdRef.current = taskId;
      return;
    }

    pendingTaskScrollIdRef.current = null;
    const containerPaddingTop =
      Number.parseFloat(window.getComputedStyle(container).paddingTop) || ZERO_OFFSET;
    const nextPaddingBottom = Math.max(
      DEFAULT_CHAT_SCROLL_PADDING_BOTTOM,
      container.clientHeight - containerPaddingTop - taskElement.offsetHeight,
    );

    setUiState({ chatScrollPaddingBottom: nextPaddingBottom });

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        container.scrollTo({
          top: Math.max(ZERO_OFFSET, taskElement.offsetTop - containerPaddingTop),
          behavior,
        });
      });
    });
  }, [setUiState]);

  const registerTaskElement = useCallback((taskId: number, element: HTMLDivElement | null) => {
    if (element) {
      taskElementRefs.current.set(taskId, element);
      if (pendingTaskScrollIdRef.current === taskId) {
        scrollTaskToTop(taskId, 'auto');
      }
      return;
    }

    taskElementRefs.current.delete(taskId);
  }, [scrollTaskToTop]);

  const handleSendMessage = useCallback((text: string) => {
    const prompt = text.trim();
    const backend = window.backend;
    if (!prompt || isTaskRunning || !backend?.start_task) {
      return false;
    }

    const targetSessionId = ensureActiveSessionId();
    const targetSession = sessions.find((session) => session.id === targetSessionId);
    const historyJson = JSON.stringify(buildSessionHistory(targetSession));

    backend.start_task(prompt, selectedPromptContent, historyJson);
    return true;
  }, [ensureActiveSessionId, isTaskRunning, selectedPromptContent, sessions]);

  const stopStreaming = useCallback(() => {
    window.backend?.stop_task?.();
    stopAudioPlayback();
    setUiState({ isTaskRunning: false });
  }, [setUiState, stopAudioPlayback]);

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

  useDesktopMessageInputFocus({ inputId: MESSAGE_INPUT_ID, createNewSession });
  useChatBootstrap({
    finalizePendingSegments,
    handleSegmentFinished,
    processAudioChunk,
    reloadProfileSettings,
    scrollTaskToTop,
  });

  return (
    <ChatViewLayout
      chatScrollContainerRef={chatScrollContainerRef}
      closeWindow={closeWindow}
      handleSendMessage={handleSendMessage}
      inputId={MESSAGE_INPUT_ID}
      minimizeWindow={minimizeWindow}
      playAudio={playAudio}
      registerTaskElement={registerTaskElement}
      reloadProfileSettings={reloadProfileSettings}
      setThinkingEnabled={setThinkingEnabled}
      startWindowDrag={startWindowDrag}
      stopStreaming={stopStreaming}
      toggleMaximizeWindow={toggleMaximizeWindow}
    />
  );
};
