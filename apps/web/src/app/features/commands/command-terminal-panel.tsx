import { useEffect, useRef } from 'react';
import { Play } from 'lucide-react';
import type { TerminalLine } from './types';

interface CommandTerminalPanelProps {
  isRunning: boolean;
  selectedCommandName?: string;
  terminalLines: TerminalLine[];
  onRun: () => void;
}

export const CommandTerminalPanel = ({
  isRunning,
  selectedCommandName,
  terminalLines,
  onRun,
}: CommandTerminalPanelProps) => {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputRef.current?.scrollTo({
      top: outputRef.current.scrollHeight,
    });
  }, [terminalLines]);

  return (
    <section className="flex min-h-[520px] flex-col rounded-md border border-zinc-800 bg-zinc-950 text-zinc-50 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm text-zinc-400">Selected</p>
          <h2 className="truncate text-lg font-semibold">{selectedCommandName ?? 'No command'}</h2>
        </div>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-teal-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          type="button"
          disabled={!selectedCommandName || isRunning}
          onClick={onRun}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          {isRunning ? 'Running' : 'Run'}
        </button>
      </div>

      <div ref={outputRef} className="min-h-0 flex-1 overflow-auto p-5 font-mono text-sm leading-6">
        {terminalLines.map((line) => (
          <pre
            className={`whitespace-pre-wrap break-words ${
              line.stream === 'stderr'
                ? 'text-rose-300'
                : line.stream === 'system'
                ? 'text-sky-300'
                : 'text-emerald-100'
            }`}
            key={line.id}
          >
            {line.text}
          </pre>
        ))}
      </div>
    </section>
  );
};