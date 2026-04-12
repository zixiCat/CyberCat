import { Button, Tooltip } from 'antd';
import { ChevronDown, Logs, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useEffect, useRef } from 'react';
import { useSetState } from 'react-use';

import { useChatUiStore } from './chatUiStore';
import { TaskLogSource } from './types';

const LOG_PANEL_HEIGHT_PX = 220;
const MAXIMIZED_LOG_PANEL_HEIGHT_PX = 520;

interface TaskLogPanelProps {
  className?: string;
}

const TASK_LOG_SOURCE_STYLES: Record<TaskLogSource, string> = {
  status: 'text-amber-300',
  tool: 'text-sky-300',
  stdout: 'text-emerald-300',
  stderr: 'text-rose-300',
};

const TASK_LOG_SOURCE_LABELS: Record<TaskLogSource, string> = {
  status: 'STATUS',
  tool: 'TOOL',
  stdout: 'STDOUT',
  stderr: 'STDERR',
};

export const TaskLogPanel = memo(({ className = '' }: TaskLogPanelProps) => {
  const [{ isMaximized }, setState] = useSetState({ isMaximized: false });
  const activeTaskLogTaskId = useChatUiStore((state) => state.activeTaskLogTaskId);
  const taskLogEntries = useChatUiStore((state) => state.taskLogEntries);
  const isTaskLogExpanded = useChatUiStore((state) => state.isTaskLogExpanded);
  const clearTaskLog = useChatUiStore((state) => state.clearTaskLog);
  const setTaskLogExpanded = useChatUiStore((state) => state.setTaskLogExpanded);
  const logBodyRef = useRef<HTMLDivElement | null>(null);
  const latestEntry = taskLogEntries[taskLogEntries.length - 1] ?? null;
  const panelHeight = isMaximized ? MAXIMIZED_LOG_PANEL_HEIGHT_PX : LOG_PANEL_HEIGHT_PX;

  useEffect(() => {
    if (!isTaskLogExpanded || !logBodyRef.current) {
      return;
    }

    logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
  }, [isTaskLogExpanded, taskLogEntries.length]);

  if (!taskLogEntries.length && activeTaskLogTaskId === null) {
    return null;
  }

  return (
    <section
      className={`
        z-30 overflow-hidden rounded-2xl border border-black/5 bg-white/92 shadow-lg
        shadow-zinc-950/10 backdrop-blur-md

        dark:border-white/10 dark:bg-zinc-950/92 dark:shadow-black/30
        ${className}
      `}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="
              flex size-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br
              from-zinc-950 to-zinc-700 text-zinc-100

              dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-950
            "
          >
            <Logs size={14} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
                Feature logs
              </span>
              {activeTaskLogTaskId !== null && (
                <span
                  className="
                    rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-700

                    dark:bg-zinc-800 dark:text-zinc-200
                  "
                >
                  Task {activeTaskLogTaskId}
                </span>
              )}
              <span
                className="
                  rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700

                  dark:bg-emerald-500/15 dark:text-emerald-200
                "
              >
                {taskLogEntries.length} lines
              </span>
              <span
                className="
                  rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700

                  dark:bg-sky-500/15 dark:text-sky-200
                "
              >
                {isMaximized ? 'Large Console' : 'Docked Console'}
              </span>
            </div>

            <p className="truncate pr-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              {latestEntry ? latestEntry.message : 'Waiting for feature output...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip title={isMaximized ? 'Restore log size' : 'Maximize logs'} placement="top">
            <Button
              type="text"
              size="small"
              onClick={() => setState({ isMaximized: !isMaximized })}
              icon={isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              className="text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
            />
          </Tooltip>

          <Tooltip title={isTaskLogExpanded ? 'Collapse log body' : 'Expand log body'} placement="top">
            <Button
              type="text"
              size="small"
              onClick={() => setTaskLogExpanded(!isTaskLogExpanded)}
              icon={<ChevronDown size={14} className={isTaskLogExpanded ? '' : '-rotate-180'} />}
              className="text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
            />
          </Tooltip>

          <Tooltip title="Clear logs" placement="top">
            <Button
              type="text"
              size="small"
              onClick={clearTaskLog}
              icon={<Trash2 size={14} />}
              className="text-zinc-500 hover:bg-zinc-100 hover:text-rose-600 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-rose-300"
            />
          </Tooltip>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isTaskLogExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: panelHeight, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div
              ref={logBodyRef}
              className="
                overflow-auto border-t border-black/5 bg-zinc-950/98 px-3 py-2 font-mono text-[11px]
                leading-5 text-zinc-100

                dark:border-white/10
              "
              style={{ height: `${panelHeight}px` }}
            >
              {taskLogEntries.map((entry, index) => (
                <div
                  key={`${entry.taskId}-${entry.timestamp}-${index}`}
                  className="grid grid-cols-[auto_auto_1fr] gap-3 border-b border-white/5 py-1.5 last:border-b-0"
                >
                  <span className="shrink-0 text-zinc-500">{entry.timestamp.slice(-8)}</span>
                  <span
                    className={`shrink-0 text-[10px] font-semibold ${TASK_LOG_SOURCE_STYLES[entry.source]}`}
                  >
                    {TASK_LOG_SOURCE_LABELS[entry.source]}
                  </span>
                  <span className="min-w-0 whitespace-pre-wrap break-words text-zinc-100">
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
});