import { Languages } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSelectionAssistantFeed } from './use-selection-assistant-feed';

interface SelectionAssistantPanelProps {
  onEntry: () => void;
}

export const SelectionAssistantPanel = ({ onEntry }: SelectionAssistantPanelProps) => {
  const { entry, shortcut } = useSelectionAssistantFeed(onEntry);
  const helperMessage = shortcut
    ? `Press ${shortcut} after selecting text anywhere on Windows.`
    : 'Press the configured shortcut after selecting text anywhere on Windows.';

  return (
    <section className="flex min-h-[520px] flex-col rounded-md border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-zinc-800">
        <div>
          <h2 className="text-xl font-semibold leading-tight">Selection Assistant</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Single-result translation and rewrite helper</p>
        </div>
        <Languages className="h-6 w-6 text-sky-600 dark:text-sky-400" aria-hidden="true" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <AnimatePresence mode="wait">
          {entry ? (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="grid gap-5"
              >
                {entry.errorMessage ? (
                  <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                    {entry.errorMessage}
                  </div>
                ) : (
                  <div className="rounded-md border border-slate-200 p-4 dark:border-zinc-800">
                    <div className="selection-assistant-markdown text-sm leading-6 text-slate-700 dark:text-zinc-200">
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
                            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[13px] text-slate-800 dark:bg-zinc-800 dark:text-zinc-100">
                              {children}
                            </code>
                          ),
                          pre: ({ children }) => (
                            <pre className="mt-3 overflow-x-auto rounded-md bg-zinc-950 p-4 font-mono text-[13px] text-zinc-50 first:mt-0">
                              {children}
                            </pre>
                          ),
                          strong: ({ children }) => <strong className="font-semibold text-slate-950 dark:text-zinc-50">{children}</strong>,
                        }}
                      >
                        {entry.outputText}
                      </ReactMarkdown>
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
              className="rounded-md border border-dashed border-slate-200 px-5 py-8 text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-400"
            >
              Waiting for the latest selection assistant result. {helperMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};