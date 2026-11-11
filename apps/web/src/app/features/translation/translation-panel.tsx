import { Alert, Button, Input, Spin } from 'antd';
import { Search } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useSetState } from 'react-use';
import { BrandTitle } from '../../components/brand-title';
import { readTranslationHistory, searchTranslation, type TranslationEntry } from './translation-api';
import { TranslationResult } from './translation-result';

interface TranslationState {
  input: string;
  entry: TranslationEntry | null;
  history: TranslationEntry[];
  historyStatus: 'loading' | 'ready' | 'failed';
  searching: boolean;
  error: string;
  lookupQuery: string;
  translateAsWritten: boolean;
}

export const TranslationPanel = () => {
  const [state, setState] = useSetState<TranslationState>({
    input: '',
    entry: null,
    history: [],
    historyStatus: 'loading',
    searching: false,
    error: '',
    lookupQuery: '',
    translateAsWritten: false,
  });
  const historyRequest = useRef<AbortController | null>(null);
  const activeSearch = useRef<AbortController | null>(null);
  const resultRegion = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (state.entry) {
      resultRegion.current?.focus({ preventScroll: true });
    }
  }, [state.entry]);

  useEffect(() => {
    const controller = new AbortController();
    historyRequest.current = controller;
    void readTranslationHistory(controller.signal).then(
      (history) => {
        if (!controller.signal.aborted) {
          setState({ history, historyStatus: 'ready' });
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setState({ historyStatus: 'failed' });
        }
      },
    );
    return () => {
      controller.abort();
      activeSearch.current?.abort();
    };
  }, [setState]);

  const search = async (query = state.input.trim(), translateAsWritten = false) => {
    if (!query) {
      return;
    }
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setState({ searching: true, error: '', entry: null, lookupQuery: query, translateAsWritten });
    try {
      const { entry, history } = await searchTranslation(query, controller.signal, translateAsWritten);
      if (controller.signal.aborted) {
        return;
      }
      historyRequest.current?.abort();
      setState({ entry, history, historyStatus: 'ready' });
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({ error: error instanceof Error ? error.message : 'Could not complete the lookup.' });
      }
    } finally {
      if (activeSearch.current === controller) {
        activeSearch.current = null;
      }
      if (!controller.signal.aborted) {
        setState({ searching: false });
      }
    }
  };

  return (
    <section className="panel" aria-label="Translation">
      <header className="panel-header">
        <BrandTitle title="Translation" />
      </header>
      <div className="flex flex-col gap-5 p-5 text-sm">
        <form className="flex items-center gap-2" onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}>
          <Input
            size="large"
            allowClear
            prefix={<Search size={18} aria-hidden="true" />}
            aria-label="Look up a word or sentence"
            placeholder="Look up a word or sentence"
            maxLength={4000}
            value={state.input}
            onChange={(event) => {
              activeSearch.current?.abort();
              activeSearch.current = null;
              setState({ input: event.target.value, entry: null, error: '', searching: false, lookupQuery: '' });
            }}
          />
          <Button size="large" type="primary" htmlType="submit" loading={state.searching}
            disabled={!state.input.trim()}>
            Search
          </Button>
        </form>
        {state.lookupQuery && state.lookupQuery !== state.input.trim() && (
          <p className="wrap-anywhere text-(--app-text-secondary)">
            {state.searching ? 'Looking up ' : 'Selected word: '}<strong>{state.lookupQuery}</strong> · Original query: {state.input.trim()}
          </p>
        )}
        {state.error && <Alert title={state.error} type="error" showIcon
          action={<Button onClick={() => void search(state.lookupQuery, state.translateAsWritten)}>Retry</Button>} />}
        <div ref={resultRegion} role="region" aria-label="Lookup result" tabIndex={-1}
          aria-live="polite" aria-busy={state.searching} className="flex flex-col gap-5 outline-none empty:hidden">
          {state.searching && <Spin aria-label="Searching" />}
          {state.entry && <TranslationResult entry={state.entry}
            onCorrection={(query) => void search(query)}
            onTranslateAsWritten={() => void search(state.entry?.query, true)} />}
        </div>
        {!state.input.trim() && (
          <section className="flex flex-col gap-5 border-t border-(--app-border) pt-5" aria-label="Recent lookups">
            <div className="flex flex-wrap items-baseline gap-5">
              <h3 className="text-lg font-semibold">Recent lookups</h3>
              <span className="text-(--app-text-secondary)">Latest 100</span>
            </div>
            {state.historyStatus === 'loading' && <Spin aria-label="Loading recent lookups" />}
            {state.historyStatus === 'failed' && <Alert title="Could not load recent lookups." type="warning" showIcon />}
            {state.historyStatus === 'ready' && state.history.length === 0 && (
              <p className="text-(--app-text-secondary)">Your recent lookups will appear here.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {state.history.map((entry) => (
                <Button key={entry.query} className="max-w-full" title={entry.query}
                  onClick={() => setState({ entry, input: entry.query, error: '', lookupQuery: entry.query })}>
                  <span className="truncate" lang={entry.result.sourceLanguage}>{entry.query}</span>
                </Button>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
};
