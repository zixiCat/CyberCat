import { useCallback, useEffect, useRef } from 'react';
import { Play, Search, SquareTerminal } from 'lucide-react';
import type { CommandDefinition } from './types';

interface CommandListPanelProps {
  filter: string;
  filterInputRef: (element: HTMLInputElement | null) => void;
  isLoadingCommands: boolean;
  isRunning: boolean;
  commands: CommandDefinition[];
  selectedCommandName: string;
  onFilterChange: (value: string) => void;
  onRun: () => void;
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
  const inputRef = useRef<HTMLInputElement>(null);

  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      filterInputRef(node);
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
    <section className="flex min-h-0 flex-col rounded-md border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold leading-tight">CyberCat Commands</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">xgd and zixiCat</p>
        </div>
        <div className="flex items-center gap-5">
          <SquareTerminal className="h-6 w-6 text-teal-600 dark:text-teal-400" aria-hidden="true" />
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-teal-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
            type="button"
            disabled={!selectedCommandName || isRunning}
            onClick={onRun}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {isRunning ? 'Running' : 'Run'}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
        <Search className="h-5 w-5 text-slate-400" aria-hidden="true" />
        <input
          ref={setInputRef}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400 dark:placeholder:text-zinc-500"
          placeholder="Filter commands"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
        />
      </label>

      <div className="min-h-[280px] flex-1 overflow-y-auto p-3">
        {isLoadingCommands ? (
          <div className="px-2 py-3 text-sm text-slate-500 dark:text-zinc-400">Loading commands...</div>
        ) : (
          <div className="grid gap-2">
            {commands.map((command) => {
              const isSelected = command.name === selectedCommandName;

              return (
                <button
                  className={`rounded-md border px-3 py-3 text-left transition-colors ${
                    isSelected
                      ? 'border-teal-500 bg-teal-50 text-teal-950 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-50'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800'
                  }`}
                  key={command.name}
                  type="button"
                  onClick={() => onSelectCommand(command.name)}
                >
                  <span className="block text-sm font-semibold leading-5">{command.name}</span>
                  <span className="mt-1 block break-words font-mono text-sm text-slate-500 dark:text-zinc-400">
                    {command.command}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};