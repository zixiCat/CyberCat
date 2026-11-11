import { Alert, Spin } from 'antd';
import { Languages, LoaderCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { BrandTitle } from '../../components/brand-title';
import { SelectionAssistantMarkdown } from './selection-assistant-markdown';
import { useSelectionAssistantFeed } from './use-selection-assistant-feed';
import { SelectionAssistantInput } from './selection-assistant-input';

interface SelectionAssistantPanelProps {
  onEntry: () => void;
}

export const SelectionAssistantPanel = ({ onEntry }: SelectionAssistantPanelProps) => {
  const { connectionError, entry, shortcut, submitText, submissionError, isSubmitting } = useSelectionAssistantFeed(onEntry);
  const helperMessage = shortcut
    ? `Press ${shortcut} after selecting text anywhere on Windows.`
    : 'Press the configured shortcut after selecting text anywhere on Windows.';

  return (
    <section className="panel assistant-panel">
      <header className="panel-header">
        <div>
          <BrandTitle title="Selection Assistant" />
        </div>
        <Languages className="panel-icon" aria-hidden="true" />
      </header>

      <div className="assistant-content">
        <SelectionAssistantInput
          isBusy={isSubmitting || entry?.status === 'loading' || entry?.status === 'streaming'}
          error={submissionError}
          onSubmit={submitText}
        />
        <AnimatePresence mode="wait">
          {connectionError ? (
            <motion.div
              key="connection-error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <Alert type="error" showIcon message={connectionError} />
            </motion.div>
          ) : entry ? (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="assistant-entry"
              >
                {entry.status === 'loading' ? (
                  <div className="assistant-loading">
                    <Spin indicator={<LoaderCircle aria-hidden="true" />} />
                    Starting the assistant…
                  </div>
                ) : entry.errorMessage ? (
                  <Alert type="error" showIcon message={entry.errorMessage} />
                ) : (
                  <div className="assistant-result">
                    {entry.status === 'streaming' ? (
                      <div className="assistant-streaming">
                        <motion.span
                          animate={{ opacity: [0.35, 1, 0.35] }}
                          transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity }}
                          className="streaming-dot"
                        />
                        Generating response…
                      </div>
                    ) : null}
                    <div className="selection-assistant-markdown">
                      <SelectionAssistantMarkdown
                        outputText={entry.outputText}
                        copyEnabled={entry.status === 'complete'}
                      />
                      {entry.status === 'streaming' ? (
                        <motion.span
                          aria-hidden="true"
                          animate={{ opacity: [0.2, 1, 0.2] }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                          className="streaming-caret"
                        />
                      ) : null}
                    </div>
                  </div>
                )}
              </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="assistant-empty"
            >
              <img
                className="assistant-empty-mascot"
                src="/assets/brand/CyberCatDetailed.png"
                width={140}
                height={175}
                alt=""
                aria-hidden="true"
              />
              <div>
                <p className="assistant-empty-title">Ready when you are</p>
                <p>Type or paste text above to get started. {helperMessage}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};
