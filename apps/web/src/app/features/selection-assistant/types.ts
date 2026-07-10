export type SelectionAssistantRuntimeState = 'idle' | 'busy' | 'disabled' | 'unsupported' | 'misconfigured';

export interface SelectionAssistantEntry {
  id: string;
  createdAt: string;
  status: 'success' | 'error';
  shortcut: string;
  inputText: string;
  outputText: string;
  errorMessage?: string;
  model: string;
  promptFilePath: string;
  logFilePath: string;
  logSaved: boolean;
  logErrorMessage?: string;
}

export interface SelectionAssistantStatus {
  state: SelectionAssistantRuntimeState;
  message: string;
  shortcut: string;
  model: string;
  promptFilePath: string;
  logFilePath: string;
}

export interface SelectionAssistantSnapshot {
  entry: SelectionAssistantEntry | null;
  status: SelectionAssistantStatus;
}

export interface SelectionAssistantFeedState {
  entry: SelectionAssistantEntry | null;
  status: SelectionAssistantStatus | null;
  isConnected: boolean;
  connectionError: string;
}