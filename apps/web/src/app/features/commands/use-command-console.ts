import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSetState } from 'react-use';
import { SSE, type SSEvent } from 'sse.js';
import { matchSorter } from 'match-sorter';
import { useHotkeys } from 'react-hotkeys-hook';
import type { CommandConsoleState, CommandDefinition, TerminalLine } from './types';

const apiBaseUrl = process.env['NX_PUBLIC_API_BASE_URL'] ?? '/api';

const parseSseData = <T,>(event: SSEvent): T => JSON.parse(String(event.data)) as T;

const initialState: CommandConsoleState = {
  commands: [],
  filter: '',
  isLoadingCommands: true,
  isRunning: false,
  selectedCommandName: '',
  terminalLines: [
    {
      id: 0,
      stream: 'system',
      text: 'Ready.',
    },
  ],
};

export interface UseCommandConsoleResult {
  filter: string;
  filterInputRef: (element: HTMLInputElement | null) => void;
  filteredCommands: CommandDefinition[];
  isLoadingCommands: boolean;
  isRunning: boolean;
  selectedCommand: CommandDefinition | undefined;
  selectedCommandName: string;
  terminalLines: TerminalLine[];
  runCommand: (commandToRun?: CommandDefinition) => void;
  selectCommand: (name: string) => void;
  setFilter: (value: string) => void;
}

export const useCommandConsole = (): UseCommandConsoleResult => {
  const nextLineIdRef = useRef(1);
  const activeRunRef = useRef<SSE | null>(null);
  const [state, setState] = useSetState<CommandConsoleState>(initialState);

  const appendLine = useCallback(
    (stream: TerminalLine['stream'], text: string) => {
      setState((previousState) => ({
        terminalLines: [
          ...previousState.terminalLines,
          {
            id: nextLineIdRef.current++,
            stream,
            text,
          },
        ],
      }));
    },
    [setState]
  );

  useEffect(() => {
    const commandSource = new SSE(`${apiBaseUrl}/commands/stream`);

    commandSource.addEventListener('commands', (event: SSEvent) => {
      const { commands } = parseSseData<{ commands: CommandDefinition[] }>(event);
      setState({
        commands,
        isLoadingCommands: false,
        selectedCommandName: commands[0]?.name ?? '',
      });
    });

    commandSource.addEventListener('error', (event: SSEvent) => {
      const fallbackMessage = 'Unable to load commands.';
      const message = event.data ? parseSseData<{ message: string }>(event).message : fallbackMessage;
      setState({ isLoadingCommands: false });
      appendLine('stderr', message);
    });

    commandSource.stream();

    return () => {
      commandSource.close();
      activeRunRef.current?.close();
    };
  }, [appendLine, setState]);

  const filteredCommands = useMemo(() => {
    const filter = state.filter.trim();

    if (!filter) {
      return state.commands;
    }

    return matchSorter(state.commands, filter, {
      keys: ['name', 'command', 'folder'],
      threshold: matchSorter.rankings.MATCHES,
    });
  }, [state.commands, state.filter]);

  const selectedCommand = useMemo(
    () => state.commands.find((command) => command.name === state.selectedCommandName),
    [state.commands, state.selectedCommandName]
  );

  const selectCommand = useCallback(
    (name: string) => {
      setState({ selectedCommandName: name });
    },
    [setState]
  );

  const setFilter = useCallback(
    (value: string) => {
      setState((prevState) => {
        const filter = value.trim();
        const filtered = filter
          ? matchSorter(prevState.commands, filter, {
              keys: ['name', 'command', 'folder'],
              threshold: matchSorter.rankings.MATCHES,
            })
          : prevState.commands;

        return {
          filter: value,
          selectedCommandName: filter && filtered[0] ? filtered[0].name : prevState.selectedCommandName,
        };
      });
    },
    [setState]
  );

  const runCommand = useCallback(
    (commandToRun: CommandDefinition | undefined = selectedCommand) => {
      if (!commandToRun || state.isRunning) {
        return;
      }

      activeRunRef.current?.close();
      setState({
        isRunning: true,
        terminalLines: [
          {
            id: nextLineIdRef.current++,
            stream: 'system',
            text: `$ ${commandToRun.command}`,
          },
        ],
      });

      const runSource = new SSE(`${apiBaseUrl}/commands/${encodeURIComponent(commandToRun.name)}/run`, {
        method: 'POST',
      });

      activeRunRef.current = runSource;

      runSource.addEventListener('stdout', (event: SSEvent) => {
        appendLine('stdout', parseSseData<{ text: string }>(event).text);
      });

      runSource.addEventListener('stderr', (event: SSEvent) => {
        appendLine('stderr', parseSseData<{ text: string }>(event).text);
      });

      runSource.addEventListener('error', (event: SSEvent) => {
        const fallbackMessage = 'Command failed.';
        const message = event.data ? parseSseData<{ message: string }>(event).message : fallbackMessage;
        appendLine('stderr', message);
        setState({ isRunning: false });
      });

      runSource.addEventListener('exit', (event: SSEvent) => {
        const { code, signal } = parseSseData<{ code: number | null; signal: string | null }>(event);
        appendLine('system', signal ? `Process stopped by ${signal}.` : `Process exited with code ${code ?? 0}.`);
        setState({ isRunning: false });
        runSource.close();
      });

      runSource.stream();
    },
    [appendLine, selectedCommand, setState, state.isRunning]
  );

  const runSelectedFilteredCommand = useCallback(() => {
    const commandToRun =
      filteredCommands.find((command) => command.name === state.selectedCommandName) ??
      filteredCommands[0] ??
      selectedCommand;

    if (commandToRun) {
      selectCommand(commandToRun.name);
    }

    runCommand(commandToRun);
  }, [filteredCommands, runCommand, selectCommand, selectedCommand, state.selectedCommandName]);

  const moveSelection = useCallback(
    (direction: 'up' | 'down') => {
      const currentIndex = filteredCommands.findIndex((c) => c.name === state.selectedCommandName);
      if (currentIndex === -1 && filteredCommands.length > 0) {
        setState({ selectedCommandName: filteredCommands[0].name });
        return;
      }

      let nextIndex = currentIndex + (direction === 'down' ? 1 : -1);
      if (nextIndex < 0) {
        nextIndex = filteredCommands.length - 1;
      } else if (nextIndex >= filteredCommands.length) {
        nextIndex = 0;
      }

      if (filteredCommands[nextIndex]) {
        setState({ selectedCommandName: filteredCommands[nextIndex].name });
      }
    },
    [filteredCommands, state.selectedCommandName, setState]
  );

  const filterInputRef = useHotkeys<HTMLInputElement>(
    ['enter', 'down', 'up'],
    (event) => {
      switch (event.key) {
        case 'Enter':
          runSelectedFilteredCommand();
          break;
        case 'ArrowDown':
          moveSelection('down');
          break;
        case 'ArrowUp':
          moveSelection('up');
          break;
        default:
          return;
      }

      event.preventDefault();
    },
    { enableOnFormTags: ['INPUT'] },
    [moveSelection, runSelectedFilteredCommand]
  );

  return {
    filter: state.filter,
    filterInputRef,
    filteredCommands,
    isLoadingCommands: state.isLoadingCommands,
    isRunning: state.isRunning,
    selectedCommand,
    selectedCommandName: state.selectedCommandName,
    terminalLines: state.terminalLines,
    runCommand,
    selectCommand,
    setFilter,
  };
};