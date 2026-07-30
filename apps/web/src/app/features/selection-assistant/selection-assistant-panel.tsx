import { Alert, Spin } from 'antd';
import { Languages, LoaderCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BrandTitle } from '../../components/brand-title';
import { useSelectionAssistantFeed } from './use-selection-assistant-feed';

interface SelectionAssistantPanelProps {
  onEntry: () => void;
}

export const SelectionAssistantPanel = ({ onEntry }: SelectionAssistantPanelProps) => {
  const { connectionError, entry, shortcut } = useSelectionAssistantFeed(onEntry);
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
                    Reading the selected text and starting the assistant…
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
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ children }) => <h3 className="mt-4 text-base font-semibold first:mt-0">{children}</h3>,
                          h2: ({ children }) => <h3 className="mt-4 text-base font-semibold first:mt-0">{children}</h3>,
                          h3: ({ children }) => <h4 className="mt-4 text-sm font-semibold first:mt-0">{children}</h4>,
                          p: ({ children }) => <p className="mt-3 first:mt-0">{children}</p>,
                          ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>,
                          ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>,
                          li: ({ children }) => <li>{children}</li>,
                          code: ({ children }) => (
                            <code className="markdown-code">
                              {children}
                            </code>
                          ),
                          pre: ({ children }) => (
                            <pre className="markdown-code-block">
                              {children}
                            </pre>
                          ),
                          strong: ({ children }) => <strong className="markdown-strong">{children}</strong>,
                        }}
                      >
                        {entry.outputText}
                      </ReactMarkdown>
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
              Waiting for the latest selection assistant result. {helperMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};