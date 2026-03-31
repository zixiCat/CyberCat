import { useUnmount } from 'react-use';

import { flushChatSessionSaves, useChatSessionStore } from './chatSessionStore';

export const useChatSessions = () => {
  const sessions = useChatSessionStore((state) => state.sessions);
  const selectedSessionId = useChatSessionStore((state) => state.selectedSessionId);
  const setSelectedSessionId = useChatSessionStore((state) => state.setSelectedSessionId);
  const updateSessions = useChatSessionStore((state) => state.updateSessions);
  const clearCurrentChat = useChatSessionStore((state) => state.clearCurrentChat);
  const createNewSession = useChatSessionStore((state) => state.createNewSession);
  const ensureActiveSessionId = useChatSessionStore((state) => state.ensureActiveSessionId);
  const hydrateSessions = useChatSessionStore((state) => state.hydrateSessions);

  useUnmount(flushChatSessionSaves);

  return {
    sessions,
    selectedSessionId,
    setSelectedSessionId,
    updateSessions,
    clearCurrentChat,
    createNewSession,
    ensureActiveSessionId,
    hydrateSessions,
  };
};