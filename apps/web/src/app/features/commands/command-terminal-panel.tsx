import { useEffect, useRef } from 'react';
import type { TerminalLine } from './types';

interface CommandTerminalPanelProps {
  terminalLines: TerminalLine[];
}

export const CommandTerminalPanel = ({ terminalLines }: CommandTerminalPanelProps) => {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputRef.current?.scrollTo({
      top: outputRef.current.scrollHeight,
    });
  }, [terminalLines]);

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950 text-zinc-50 shadow-sm">
      <div className="border-b border-zinc-800 p-5">
        <h2 className="text-xl font-semibold leading-tight">Execution Log</h2>
        <p className="mt-1 text-sm text-zinc-400">Live output from the selected command</p>
      </div>
      <div ref={outputRef} className="h-[640px] overflow-auto p-5 font-mono text-sm leading-6">
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