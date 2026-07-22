import { CommandListPanel } from './command-list-panel';
import { CommandTerminalPanel } from './command-terminal-panel';
import { useCommandConsole } from './use-command-console';
import { SelectionAssistantPanel } from '../selection-assistant/selection-assistant-panel';

export const CommandConsole = () => {
  const {
    filter,
    filterInputRef,
    filteredCommands,
    isLoadingCommands,
    isRunning,
    selectedCommandName,
    terminalLines,
    runCommand,
    selectCommand,
    setFilter,
  } = useCommandConsole();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-5 p-5 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)_420px]">
      <CommandListPanel
        filter={filter}
        filterInputRef={filterInputRef}
        isLoadingCommands={isLoadingCommands}
        isRunning={isRunning}
        commands={filteredCommands}
        selectedCommandName={selectedCommandName}
        onFilterChange={setFilter}
        onRun={() => runCommand()}
        onSelectCommand={selectCommand}
      />
      <CommandTerminalPanel terminalLines={terminalLines} />
      <div className="lg:col-span-2 xl:col-span-1">
        <SelectionAssistantPanel />
      </div>
    </main>
  );
};