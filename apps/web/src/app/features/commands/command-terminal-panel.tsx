import { useEffect, useRef } from 'react';
import clsx from 'clsx';
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
    <section className="terminal-panel">
      <header className="terminal-header">
        <h2 className="panel-title">Execution Log</h2>
        <p className="terminal-description">Live output from the selected command</p>
      </header>
      <div ref={outputRef} className="terminal-output">
        {terminalLines.map((line) => (
          <pre
            className={clsx('terminal-line', `terminal-line-${line.stream}`)}
            key={line.id}
          >
            {line.text}
          </pre>
        ))}
      </div>
    </section>
  );
};