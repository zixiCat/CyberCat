import { useCallback, useEffect, useRef } from 'react';
import { CommandListPanel } from './command-list-panel';
import { CommandTerminalPanel } from './command-terminal-panel';
import { useCommandConsole } from './use-command-console';
import { SelectionAssistantPanel } from '../selection-assistant/selection-assistant-panel';
import { WorkspaceNavigation, type WorkspaceNavigationHandle } from '../workspace/workspace-navigation';

const COMMAND_LIBRARY_ANCHOR = 'command-library';
const EXECUTION_LOG_ANCHOR = 'execution-log';
const SELECTION_ASSISTANT_ANCHOR = 'selection-assistant';
export const CommandConsole = () => {
  const workspaceNavigationRef = useRef<WorkspaceNavigationHandle>(null);
  const {
    filter,
    focusFilterInput,
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
    workspaceNavigationRef.current?.navigateTo(SELECTION_ASSISTANT_ANCHOR);
  }, []);

  const focusFilterForNavigation = useCallback(
    (anchor: string) => {
      if (anchor === COMMAND_LIBRARY_ANCHOR) {
        requestAnimationFrame(focusFilterInput);
      }
    },
    [focusFilterInput]
  );

  useEffect(() => {
    if (isRunning) {
      workspaceNavigationRef.current?.navigateTo(EXECUTION_LOG_ANCHOR);
    }
  }, [isRunning]);

  useEffect(() => {
    const focusFilterWhenCommandLibraryIsActive = () => {
      if (window.location.hash.slice(1) === COMMAND_LIBRARY_ANCHOR) {
        requestAnimationFrame(focusFilterInput);
      }
    };

    return () => {
      window.removeEventListener('focus', focusFilterWhenCommandLibraryIsActive);
    };
  }, [focusFilterInput]);

  return (
    <>
      <WorkspaceNavigation ref={workspaceNavigationRef} onNavigate={focusFilterForNavigation} />
      <main className="workspace-content">
        <div id={COMMAND_LIBRARY_ANCHOR} className="workspace-section">
          <CommandListPanel
            filter={filter}
            filterInputRef={filterInputRef}
            isLoadingCommands={isLoadingCommands}
            isRunning={isRunning}
            commands={filteredCommands}
            selectedCommandName={selectedCommandName}
            onFilterChange={setFilter}
            onRun={runCommand}
            onSelectCommand={selectCommand}
          />
        </div>
        <div id={EXECUTION_LOG_ANCHOR} className="workspace-section">
          <CommandTerminalPanel terminalLines={terminalLines} />
        </div>
        <div id={SELECTION_ASSISTANT_ANCHOR} className="workspace-section">
          <SelectionAssistantPanel onEntry={showSelectionAssistant} />
        </div>
      </main>
    </>
  );
};