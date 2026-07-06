export interface CommandDefinition {
  name: string;
  command: string;
  folder: 'xgd' | 'zixiCat';
}

export interface TerminalLine {
  id: number;
  stream: 'system' | 'stdout' | 'stderr';
  text: string;
}

export interface CommandConsoleState {
  commands: CommandDefinition[];
  filter: string;
  isLoadingCommands: boolean;
  isRunning: boolean;
  selectedCommandName: string;
  terminalLines: TerminalLine[];
}