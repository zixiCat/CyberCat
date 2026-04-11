import { useCallback, useEffect, useRef } from 'react';

import { loadBackendJson } from '../backendShared';
import { parseConfiguredFileIngestTargets } from '../fileIngestTargets';
import {
  buildSessionHistory,
  isThinkingSupportedForModel,
  MESSAGE_INPUT_ID,
  parseStoredVoicePool,
  THINKING_FIELD_KEY,
} from './chatShared';
import { useChatUiStore } from './chatUiStore';
import { ChatViewLayout } from './ChatViewLayout';
import { PromptOption, VoiceOption } from './types';
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
  const availablePrompts = useChatUiStore((state) => state.availablePrompts);
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
    updateSessions,
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

  const syncSelectedPromptContent = useCallback(async (promptFile: string) => {
    const backend = window.backend;
    if (!promptFile || !backend?.get_prompt_content) {
      return;
    }

    try {
      const content = await backend.get_prompt_content(promptFile);
      setUiState({ selectedPromptContent: content });
      backend.set_active_system_prompt?.(content);
    } catch (error) {
      console.error('Failed to sync the selected prompt content:', error);
    }
  }, [setUiState]);

  const resolvePromptSelection = useCallback(
    (prompts: PromptOption[], preferredPromptFile: string) => {
      if (!prompts.length) {
        return null;
      }

      return (
        prompts.find((prompt) => prompt.file === preferredPromptFile) ??
        prompts.find((prompt) => prompt.file === 'Default.md') ??
        prompts[0]
      );
    },
    [],
  );

  const reloadProfileSettings = useCallback(async () => {
    const backend = window.backend;
    if (!backend?.get_settings || !backend.get_active_voice || !backend.get_voice_options) {
      return;
    }

    try {
      const [settings, activeVoice, parsedVoiceOptions, prompts] = await Promise.all([
        loadBackendJson<Record<string, string | boolean>>(
          () => backend.get_settings?.(),
          'Profile settings',
        ),
        loadBackendJson<{ voice: string }>(() => backend.get_active_voice?.(), 'Active voice'),
        loadBackendJson<VoiceOption[]>(() => backend.get_voice_options?.(), 'Voice options'),
        backend.get_available_prompts
          ? loadBackendJson<PromptOption[]>(() => backend.get_available_prompts?.(), 'Available prompts')
          : Promise.resolve(availablePrompts),
      ]);

      const modelName = typeof settings.openai_model === 'string' ? settings.openai_model : '';
      const storedRandomVoicePool = parseStoredVoicePool(settings.random_voice_pool);
      const supported = isThinkingSupportedForModel(modelName);
      const fileIngestTargets = parseConfiguredFileIngestTargets(settings.file_ingest_targets);
      const fileIngestEnabled = Boolean(
        settings.feature_file_ingest_enabled && backend.start_file_ingest,
      );
      const resolvedPrompt = resolvePromptSelection(prompts, selectedPromptFile);

      setUiState({
        availablePrompts: prompts,
        voiceOptions: parsedVoiceOptions,
        selectedVoice: activeVoice.voice || 'auto',
        randomVoicePool: storedRandomVoicePool,
        fileIngestEnabled,
        fileIngestTargets,
        thinkingSupported: supported,
        thinkingEnabled: supported && Boolean(settings[THINKING_FIELD_KEY]),
        selectedPromptFile: resolvedPrompt?.file ?? '',
        ...(resolvedPrompt ? {} : { selectedPromptContent: '' }),
      });

      if (resolvedPrompt) {
        await syncSelectedPromptContent(resolvedPrompt.file);
      } else {
        backend.set_active_system_prompt?.('');
      }
    } catch (error) {
      console.error('Failed to reload profile settings:', error);
    }
  }, [availablePrompts, resolvePromptSelection, selectedPromptFile, setUiState, syncSelectedPromptContent]);

  useEffect(() => {
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (!session?.systemPromptFile) {
      return;
    }

    const resolvedSessionPrompt = availablePrompts.some(
      (prompt) => prompt.file === session.systemPromptFile,
    )
      ? session.systemPromptFile
      : resolvePromptSelection(availablePrompts, session.systemPromptFile)?.file;

    if (!resolvedSessionPrompt) {
      return;
    }

    if (session.systemPromptFile !== resolvedSessionPrompt) {
      updateSessions((prev) =>
        prev.map((currentSession) =>
          currentSession.id === selectedSessionId
            ? { ...currentSession, systemPromptFile: resolvedSessionPrompt }
            : currentSession,
        ),
      );
    }

    if (resolvedSessionPrompt === selectedPromptFile) {
      return;
    }

    setUiState({ selectedPromptFile: resolvedSessionPrompt });
    void syncSelectedPromptContent(resolvedSessionPrompt);
  }, [availablePrompts, resolvePromptSelection, selectedPromptFile, selectedSessionId, sessions, setUiState, syncSelectedPromptContent, updateSessions]);

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
