import { create } from 'zustand';

import {
  formatTimestamp,
  generateSessionId,
  SESSION_SAVE_DELAY_MS,
  stripTransientSessionData,
} from './chatShared';
import { useChatUiStore } from './chatUiStore';
import { Session } from './types';

const EMPTY_SIZE = 0;
const LAST_ITEM_OFFSET = 1;

interface ChatSessionState {
  sessions: Session[];
  selectedSessionId: string | null;
  setSelectedSessionId: (sessionId: string | null) => void;
  updateSessions: (updater: (prev: Session[]) => Session[]) => void;
  createNewSession: () => Session;
  ensureActiveSessionId: () => string;
  clearCurrentChat: () => void;
  hydrateSessions: (sessions: Session[]) => void;
}

const pendingSessionSaveIds = new Set<string>();
let sessionSaveTimer: number | null = null;

const resolveSelectedSessionId = (
  sessions: Session[],
  selectedSessionId: string | null,
) => {
  if (selectedSessionId && sessions.some((session) => session.id === selectedSessionId)) {
    return selectedSessionId;
  }

  return sessions.length > EMPTY_SIZE ? sessions[sessions.length - LAST_ITEM_OFFSET].id : null;
};

const flushPendingSessionSaves = () => {
  sessionSaveTimer = null;

  if (!window.backend || pendingSessionSaveIds.size === EMPTY_SIZE) {
    pendingSessionSaveIds.clear();
    return;
  }

  const { sessions } = useChatSessionStore.getState();
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));

  pendingSessionSaveIds.forEach((sessionId) => {
    const session = sessionsById.get(sessionId);
    if (!session) {
      return;
    }

    try {
      window.backend?.save_session?.(session.id, JSON.stringify(stripTransientSessionData(session)));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  });

  pendingSessionSaveIds.clear();
};

const scheduleSessionSave = (sessionIds: string[]) => {
  sessionIds.forEach((sessionId) => {
    pendingSessionSaveIds.add(sessionId);
  });

  if (sessionSaveTimer !== null) {
    window.clearTimeout(sessionSaveTimer);
  }

  sessionSaveTimer = window.setTimeout(flushPendingSessionSaves, SESSION_SAVE_DELAY_MS);
};

export const flushChatSessionSaves = () => {
  if (sessionSaveTimer !== null) {
    window.clearTimeout(sessionSaveTimer);
  }

  flushPendingSessionSaves();
};

export const useChatSessionStore = create<ChatSessionState>((set, get) => ({
  sessions: [],
  selectedSessionId: null,
  setSelectedSessionId: (sessionId) => {
    set((state) => ({
      selectedSessionId: resolveSelectedSessionId(state.sessions, sessionId),
    }));
  },
  updateSessions: (updater) => {
    const previousSessions = get().sessions;
    const nextSessions = updater(previousSessions);
    const previousSessionsById = new Map(previousSessions.map((session) => [session.id, session]));
    const changedSessionIds = nextSessions
      .filter((session) => previousSessionsById.get(session.id) !== session)
      .map((session) => session.id);
    const hasSameOrder =
      nextSessions.length === previousSessions.length &&
      nextSessions.every((session, index) => session === previousSessions[index]);

    if (changedSessionIds.length === EMPTY_SIZE && hasSameOrder) {
      return;
    }

    if (changedSessionIds.length > EMPTY_SIZE) {
      scheduleSessionSave(changedSessionIds);
    }

    set((state) => ({
      sessions: nextSessions,
      selectedSessionId: resolveSelectedSessionId(nextSessions, state.selectedSessionId),
    }));
  },
  createNewSession: () => {
    const newSession: Session = {
      id: generateSessionId(),
      timestamp: formatTimestamp(),
      tasks: [],
      systemPromptFile: useChatUiStore.getState().selectedPromptFile,
    };

    get().updateSessions((prev) => [...prev, newSession]);
    set({ selectedSessionId: newSession.id });

    return newSession;
  },
  ensureActiveSessionId: () => {
    const { selectedSessionId, sessions, createNewSession } = get();
    if (selectedSessionId && sessions.some((session) => session.id === selectedSessionId)) {
      return selectedSessionId;
    }

    return createNewSession().id;
  },
  clearCurrentChat: () => {
    const currentSessionId = get().selectedSessionId;
    if (!currentSessionId) {
      return;
    }

    window.backend?.delete_session?.(currentSessionId);
    get().updateSessions((prev) => prev.filter((session) => session.id !== currentSessionId));
  },
  hydrateSessions: (sessions) => {
    set({
      sessions,
      selectedSessionId: resolveSelectedSessionId(sessions, get().selectedSessionId),
    });
  },
}));