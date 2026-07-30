import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { BrandTitle } from '../../components/brand-title';
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
        <BrandTitle title="Execution Log" />
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