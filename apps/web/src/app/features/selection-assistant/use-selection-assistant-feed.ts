import { useEffect, useRef } from 'react';
import { useSetState } from 'react-use';
import { SSE, type SSEvent } from 'sse.js';
import { apiBaseUrl } from '../../api-base-url';
import type {
  SelectionAssistantEntry,
  SelectionAssistantFeedState,
  SelectionAssistantSnapshot,
  SelectionAssistantStatus,
} from './types';

const parseSseData = <T,>(event: SSEvent): T => JSON.parse(String(event.data)) as T;

const initialState: SelectionAssistantFeedState = {
  connectionError: '',
  entry: null,
  isConnected: false,
  status: null,
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
        status: snapshot.status,
      });
    });

    source.addEventListener('status', (event: SSEvent) => {
      const { status } = parseSseData<{ status: SelectionAssistantStatus }>(event);

      setState({
        connectionError: '',
        isConnected: true,
        status,
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
      const message = event.data ? parseSseData<{ message: string }>(event).message : fallbackMessage;

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
    status: state.status,
  };
};