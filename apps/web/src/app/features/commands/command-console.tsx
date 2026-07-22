import { useCallback, useEffect } from 'react';
import { CommandListPanel } from './command-list-panel';
import { CommandTerminalPanel } from './command-terminal-panel';
import { useCommandConsole } from './use-command-console';
import { SelectionAssistantPanel } from '../selection-assistant/selection-assistant-panel';
import { WorkspaceNavigation } from '../workspace/workspace-navigation';

const COMMAND_LIBRARY_ANCHOR = 'command-library';
const SELECTION_ASSISTANT_ANCHOR = 'selection-assistant';

const navigateToAnchor = (anchor: string) => {
  const target = document.getElementById(anchor);

  if (!target) {
    return;
  }

  window.history.replaceState(null, '', `#${anchor}`);
  target.scrollIntoView({ block: 'start' });
};

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

  const showSelectionAssistant = useCallback(() => {
    navigateToAnchor(SELECTION_ASSISTANT_ANCHOR);
  }, []);

  useEffect(() => {
    const showCommandLibrary = () => {
      navigateToAnchor(COMMAND_LIBRARY_ANCHOR);
    };

    window.addEventListener('focus', showCommandLibrary);
    showCommandLibrary();

    return () => {
      window.removeEventListener('focus', showCommandLibrary);
    };
  }, []);

  return (
    <>
      <WorkspaceNavigation />
      <main className="mx-auto grid min-h-screen w-full max-w-[1600px] gap-5 p-5">
        <div id={COMMAND_LIBRARY_ANCHOR} className="scroll-mt-20">
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
        </div>
        <div id="execution-log" className="scroll-mt-20">
          <CommandTerminalPanel terminalLines={terminalLines} />
        </div>
        <div id={SELECTION_ASSISTANT_ANCHOR} className="scroll-mt-20">
          <SelectionAssistantPanel onEntry={showSelectionAssistant} />
        </div>
      </main>
    </>
  );
};