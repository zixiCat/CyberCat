import { useEffect, useRef } from 'react';
import { useSetState } from 'react-use';
import { SSE, type SSEvent } from 'sse.js';
import { apiBaseUrl } from '../../api-base-url';
import type {
  SelectionAssistantEntry,
  SelectionAssistantFeedState,
  SelectionAssistantSnapshot,
} from './types';

const parseSseData = <T,>(event: SSEvent): T => JSON.parse(String(event.data)) as T;

const parseSseErrorMessage = (event: SSEvent, fallbackMessage: string): string => {
  if (!event.data) {
    return fallbackMessage;
  }

  try {
    const payload = JSON.parse(String(event.data)) as { message?: unknown };
    return typeof payload.message === 'string' && payload.message ? payload.message : fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};

const initialState: SelectionAssistantFeedState = {
  connectionError: '',
  entry: null,
  isConnected: false,
  shortcut: '',
};

export const useSelectionAssistantFeed = () => {
  const sourceRef = useRef<SSE | null>(null);
  const [state, setState] = useSetState<SelectionAssistantFeedState>(initialState);

  useEffect(() => {
    const source = new SSE(`${apiBaseUrl}/selection-assistant/stream`);
    sourceRef.current = source;

    source.addEventListener('snapshot', (event: SSEvent) => {
      const snapshot = parseSseData<SelectionAssistantSnapshot>(event);

      setState({
        connectionError: '',
        entry: snapshot.entry,
        isConnected: true,
        shortcut: snapshot.shortcut,
      });
    });

    source.addEventListener('entry', (event: SSEvent) => {
      const { entry } = parseSseData<{ entry: SelectionAssistantEntry }>(event);

      setState({
        connectionError: '',
        entry,
        isConnected: true,
      });
    });

    source.addEventListener('error', (event: SSEvent) => {
      const fallbackMessage = 'Unable to connect to the selection assistant stream.';
      const message = parseSseErrorMessage(event, fallbackMessage);

      setState({
        connectionError: message || fallbackMessage,
        isConnected: false,
      });
    });

    source.stream();

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [setState]);

  return {
    connectionError: state.connectionError,
    entry: state.entry,
    isConnected: state.isConnected,
    shortcut: state.shortcut,
  };
};