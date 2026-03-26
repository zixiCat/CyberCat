import { useCallback, useEffect, useRef, useState } from 'react';

import { useTheme } from '../App';
import {
  buildSessionHistory,
  isThinkingSupportedForModel,
  MESSAGE_INPUT_ID,
  parseStoredVoicePool,
  THINKING_FIELD_KEY,
} from './chatShared';
import { ChatViewLayout } from './ChatViewLayout';
import { VoiceOption } from './types';
import { useChatAudio } from './useChatAudio';
import { useChatBootstrap } from './useChatBootstrap';
import { useChatSessions } from './useChatSessions';
import { useDesktopMessageInputFocus } from './useDesktopMessageInputFocus';

const ZERO_OFFSET = 0;

export const ChatView = () => {
  const { theme, setTheme } = useTheme();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [availablePrompts, setAvailablePrompts] = useState<string[]>([]);
  const [selectedPromptFile, setSelectedPromptFile] = useState<string>('Default.md');
  const [selectedPromptContent, setSelectedPromptContent] = useState<string>('');
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('auto');
  const [randomVoicePool, setRandomVoicePool] = useState<string[]>([]);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [isTaskRunning, setIsTaskRunning] = useState<boolean>(false);
  const [autoPlay, setAutoPlay] = useState<boolean>(
    () => localStorage.getItem('autoPlay') !== 'false',
  );
  const [thinkingEnabled, setThinkingEnabledState] = useState(false);
  const [thinkingSupported, setThinkingSupported] = useState(false);
  const autoPlayRef = useRef(autoPlay);
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const taskElementRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pendingTaskScrollIdRef = useRef<number | null>(null);
  const {
    sessions,
    selectedSessionId,
    setSelectedSessionId,
    sessionsRef,
    updateSessions,
    clearCurrentChat,
    createNewSession,
    ensureActiveSessionId,
    hydrateSessions,
  } = useChatSessions(selectedPromptFile);
  const {
    playingSegmentId,
    currentReceivingSegmentIdRef,
    playAudio,
    processAudioChunk,
    handleSegmentFinished,
    finalizePendingSegments,
    stopAudioPlayback,
  } = useChatAudio({ autoPlayRef, sessionsRef, updateSessions });

  useEffect(() => {
    autoPlayRef.current = autoPlay;
    localStorage.setItem('autoPlay', String(autoPlay));
  }, [autoPlay]);

  const setThinkingEnabled = useCallback((enabled: boolean) => {
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
  }, [thinkingEnabled, thinkingSupported]);

  const reloadProfileSettings = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (session?.systemPromptFile && session.systemPromptFile !== selectedPromptFile) {
      setSelectedPromptFile(session.systemPromptFile);
      window.backend?.get_prompt_content(session.systemPromptFile).then((content: string) => {
        setSelectedPromptContent(content);
        window.backend?.set_active_system_prompt(content);
      });
    }
  }, [selectedPromptFile, selectedSessionId, sessions]);
  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
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
  }, []);
  const scrollTaskToTop = useCallback((taskId: number, behavior: ScrollBehavior = 'smooth') => {
    const container = chatScrollContainerRef.current;
    const taskElement = taskElementRefs.current.get(taskId);
    if (!container || !taskElement) {
      pendingTaskScrollIdRef.current = taskId;
      return;
    }

    pendingTaskScrollIdRef.current = null;
    window.requestAnimationFrame(() => {
      const containerPaddingTop =
        Number.parseFloat(window.getComputedStyle(container).paddingTop) || ZERO_OFFSET;
      container.scrollTo({
        top: Math.max(ZERO_OFFSET, taskElement.offsetTop - containerPaddingTop),
        behavior,
      });
    });
  }, []);
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
    const targetSession = sessionsRef.current.find((session) => session.id === targetSessionId);
    const historyJson = JSON.stringify(buildSessionHistory(targetSession));

    backend.start_task(prompt, selectedPromptContent, historyJson);
    scrollChatToBottom('smooth');
    return true;
  }, [ensureActiveSessionId, isTaskRunning, scrollChatToBottom, selectedPromptContent, sessionsRef]);
  const stopStreaming = useCallback(() => {
    window.backend?.stop_task();
    stopAudioPlayback();
    setIsTaskRunning(false);
  }, [stopAudioPlayback]);
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
  });

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  return (
    <ChatViewLayout
      autoPlay={autoPlay}
      availablePrompts={availablePrompts}
      chatScrollContainerRef={chatScrollContainerRef}
      clearCurrentChat={clearCurrentChat}
      closeWindow={closeWindow}
      createNewSession={createNewSession}
      currentReceivingSegmentId={currentReceivingSegmentIdRef.current}
      handleSendMessage={handleSendMessage}
      inputId={MESSAGE_INPUT_ID}
      isSidebarCollapsed={isSidebarCollapsed}
      isTaskRunning={isTaskRunning}
      isWindowMaximized={isWindowMaximized}
      minimizeWindow={minimizeWindow}
      playAudio={playAudio}
      playingSegmentId={playingSegmentId}
      randomVoicePool={randomVoicePool}
      registerTaskElement={registerTaskElement}
      reloadProfileSettings={reloadProfileSettings}
      selectedPromptFile={selectedPromptFile}
      selectedSession={selectedSession}
      selectedSessionId={selectedSessionId}
      selectedVoice={selectedVoice}
      sessions={sessions}
      setAutoPlay={setAutoPlay}
      setIsSidebarCollapsed={setIsSidebarCollapsed}
      setRandomVoicePool={setRandomVoicePool}
      setSelectedPromptContent={setSelectedPromptContent}
      setSelectedPromptFile={setSelectedPromptFile}
      setSelectedSessionId={setSelectedSessionId}
      setSelectedVoice={setSelectedVoice}
      setTheme={setTheme}
      setThinkingEnabled={setThinkingEnabled}
      startWindowDrag={startWindowDrag}
      stopStreaming={stopStreaming}
      thinkingEnabled={thinkingEnabled}
      thinkingSupported={thinkingSupported}
      theme={theme}
      toggleMaximizeWindow={toggleMaximizeWindow}
      updateSessions={updateSessions}
      voiceOptions={voiceOptions}
    />
  );
};
