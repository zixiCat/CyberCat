import { useCallback, useEffect, useRef, useState } from 'react';
import { useUnmount } from 'react-use';

import {
  formatTimestamp,
  generateSessionId,
  SESSION_SAVE_DELAY_MS,
  stripTransientSessionData,
} from './chatShared';
import { Session } from './types';

export const useChatSessions = (selectedPromptFile: string) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const sessionsRef = useRef<Session[]>(sessions);
  const selectedSessionIdRef = useRef<string | null>(selectedSessionId);
  const selectedPromptFileRef = useRef(selectedPromptFile);
  const pendingSessionSaveIdsRef = useRef<Set<string>>(new Set());
  const sessionSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    selectedPromptFileRef.current = selectedPromptFile;
  }, [selectedPromptFile]);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;

    if (!selectedSessionId && sessions.length > 0) {
      const nextSelectedSessionId = sessions[sessions.length - 1].id;
      selectedSessionIdRef.current = nextSelectedSessionId;
      setSelectedSessionId(nextSelectedSessionId);
    }
  }, [selectedSessionId, sessions]);

  const flushPendingSessionSaves = useCallback(() => {
    sessionSaveTimerRef.current = null;

    if (!window.backend || pendingSessionSaveIdsRef.current.size === 0) {
      pendingSessionSaveIdsRef.current.clear();
      return;
    }

    const sessionsById = new Map(sessionsRef.current.map((session) => [session.id, session]));

    pendingSessionSaveIdsRef.current.forEach((sessionId) => {
      const session = sessionsById.get(sessionId);
      if (!session) {
        return;
      }

      try {
        window.backend?.save_session(session.id, JSON.stringify(stripTransientSessionData(session)));
      } catch (error) {
        console.error('Failed to save session:', error);
      }
    });

    pendingSessionSaveIdsRef.current.clear();
  }, []);

  const scheduleSessionSave = useCallback(
    (sessionIds: string[]) => {
      for (const sessionId of sessionIds) {
        pendingSessionSaveIdsRef.current.add(sessionId);
      }

      if (sessionSaveTimerRef.current !== null) {
        window.clearTimeout(sessionSaveTimerRef.current);
      }

      sessionSaveTimerRef.current = window.setTimeout(flushPendingSessionSaves, SESSION_SAVE_DELAY_MS);
    },
    [flushPendingSessionSaves],
  );

  const updateSessions = useCallback(
    (updater: (prev: Session[]) => Session[]) => {
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

        sessionsRef.current = next;

        if (changedSessionIds.length > 0) {
          scheduleSessionSave(changedSessionIds);
        }

        return next;
      });
    },
    [scheduleSessionSave],
  );

  const createSession = useCallback(() => {
    const newId = generateSessionId();
    const newSession: Session = {
      id: newId,
      timestamp: formatTimestamp(),
      tasks: [],
      systemPromptFile: selectedPromptFileRef.current,
    };

    updateSessions((prev) => [...prev, newSession]);
    selectedSessionIdRef.current = newId;
    setSelectedSessionId(newId);

    return newSession;
  }, [updateSessions]);

  const ensureActiveSessionId = useCallback(() => {
    const activeSessionId = selectedSessionIdRef.current;
    if (activeSessionId && sessionsRef.current.some((session) => session.id === activeSessionId)) {
      return activeSessionId;
    }

    return createSession().id;
  }, [createSession]);

  const clearCurrentChat = useCallback(() => {
    const currentSessionId = selectedSessionIdRef.current;
    if (currentSessionId === null) {
      return;
    }

    window.backend?.delete_session(currentSessionId);
    updateSessions((prev) => prev.filter((session) => session.id !== currentSessionId));
    selectedSessionIdRef.current = null;
    setSelectedSessionId(null);
  }, [updateSessions]);

  const hydrateSessions = useCallback((loadedSessions: Session[]) => {
    sessionsRef.current = loadedSessions;
    setSessions(loadedSessions);

    const nextSelectedSessionId = loadedSessions.length > 0 ? loadedSessions[loadedSessions.length - 1].id : null;
    selectedSessionIdRef.current = nextSelectedSessionId;
    setSelectedSessionId(nextSelectedSessionId);
  }, []);

  useUnmount(() => {
    if (sessionSaveTimerRef.current !== null) {
      window.clearTimeout(sessionSaveTimerRef.current);
      flushPendingSessionSaves();
    }
  });

  return {
    sessions,
    selectedSessionId,
    setSelectedSessionId,
    sessionsRef,
    updateSessions,
    clearCurrentChat,
    createNewSession: createSession,
    ensureActiveSessionId,
    hydrateSessions,
  };
};