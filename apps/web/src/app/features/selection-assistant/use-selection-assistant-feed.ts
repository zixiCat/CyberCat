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

export const useSelectionAssistantFeed = (onEntry: () => void) => {
  const sourceRef = useRef<SSE | null>(null);
  const onEntryRef = useRef(onEntry);
  const submissionRef = useRef<SSE | null>(null);
  const [{ isSubmitting, submissionError }, setSubmission] = useSetState({ isSubmitting: false, submissionError: '' });
  const [state, setState] = useSetState<SelectionAssistantFeedState>(initialState);

  onEntryRef.current = onEntry;

  useEffect(() => {
    const source = new SSE(`${apiBaseUrl}/selection-assistant/stream`, { autoReconnect: true });
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
      onEntryRef.current();
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
      const submission = submissionRef.current;
      submissionRef.current = null;
      submission?.close();
    };
  }, [setState]);

  const submitText = (text: string) => {
    const inputText = text.trim();
    if (!inputText || submissionRef.current || state.entry?.status === 'loading' || state.entry?.status === 'streaming') return;
    setSubmission({ isSubmitting: true, submissionError: '' });
    const source = new SSE(`${apiBaseUrl}/selection-assistant/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      payload: JSON.stringify({ inputText }),
    });
    submissionRef.current = source;
    const finish = () => {
      submissionRef.current = null;
      source.close();
      setSubmission({ isSubmitting: false });
    };
    // Results use the shared feed so hotkey and manual updates stay in one ordered stream.
    source.addEventListener('done', finish);
    source.addEventListener('error', (event: SSEvent) => {
      setSubmission({ submissionError: parseSseErrorMessage(event, 'Unable to submit text. Check your connection and try again.') });
      finish();
    });
    source.addEventListener('readystatechange', () => {
      if (source.readyState === SSE.CLOSED && submissionRef.current === source) {
        setSubmission({ submissionError: 'The submission connection closed. Check the result below before retrying.' });
        finish();
      }
    });
    source.stream();
  };

  return {
    connectionError: state.connectionError,
    entry: state.entry,
    isConnected: state.isConnected,
    shortcut: state.shortcut,
    submitText,
    isSubmitting,
    submissionError,
  };
};
