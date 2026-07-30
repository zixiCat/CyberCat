import { useCallback, useEffect, useRef } from 'react';
import { Button, Input } from 'antd';
import type { InputRef } from 'antd';
import clsx from 'clsx';
import { Play, Search, SquareTerminal } from 'lucide-react';
import { BrandTitle } from '../../components/brand-title';
import type { CommandDefinition } from './types';

interface CommandListPanelProps {
  filter: string;
  filterInputRef: (element: HTMLInputElement | null) => void;
  isLoadingCommands: boolean;
  isRunning: boolean;
  commands: CommandDefinition[];
  selectedCommandName: string;
  onFilterChange: (value: string) => void;
  onRun: (command?: CommandDefinition) => void;
  onSelectCommand: (name: string) => void;
}

export const CommandListPanel = ({
  filter,
  filterInputRef,
  isLoadingCommands,
  isRunning,
  commands,
  selectedCommandName,
  onFilterChange,
  onRun,
  onSelectCommand,
}: CommandListPanelProps) => {
  const inputRef = useRef<InputRef>(null);

  const setInputRef = useCallback(
    (node: InputRef | null) => {
      inputRef.current = node;
      filterInputRef(node?.input ?? null);
    },
    [filterInputRef]
  );

  useEffect(() => {
    const handleFocus = () => {
      inputRef.current?.focus();
    };

    window.addEventListener('focus', handleFocus);
    // Initial focus
    handleFocus();

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return (
    <section className="panel command-list-panel">
      <header className="panel-header">
        <BrandTitle title="Commands" />
        <div className="panel-actions">
          <SquareTerminal className="panel-icon" aria-hidden="true" />
          <Button
            type="primary"
            size="large"
            icon={<Play aria-hidden="true" />}
            loading={isRunning}
            disabled={!selectedCommandName || isRunning}
            onClick={() => onRun()}
          >
            {isRunning ? 'Running' : 'Run'}
          </Button>
        </div>
      </header>

      <div className="command-filter">
        <Input
          ref={setInputRef}
          prefix={<Search aria-hidden="true" />}
          placeholder="Filter commands"
          value={filter}
          allowClear
          size="large"
          variant="borderless"
          onChange={(event) => onFilterChange(event.target.value)}
        />
      </div>

      <div className="command-list-scroll">
        {isLoadingCommands ? (
          <div className="panel-muted">Loading commands...</div>
        ) : (
          <div className="command-list">
            {commands.map((command) => {
              const isSelected = command.name === selectedCommandName;

              return (
                <Button
                  className={clsx('command-option', isSelected && 'command-option-selected')}
                  key={command.name}
                  type={isSelected ? 'primary' : 'text'}
                  block
                  onClick={() => onSelectCommand(command.name)}
                  onDoubleClick={() => onRun(command)}
                >
                  <span className="command-name">{command.name}</span>
                  <span className="command-value">
                    {command.command}
                  </span>
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};