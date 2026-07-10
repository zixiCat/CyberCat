export interface SelectionAssistantEntry {
  id: string;
  createdAt: string;
  shortcut: string;
  inputText: string;
  outputText: string;
  errorMessage?: string;
  model: string;
  promptFilePath: string;
}

export interface SelectionAssistantSnapshot {
  entry: SelectionAssistantEntry | null;
  shortcut: string;
}

export interface SelectionAssistantFeedState {
  entry: SelectionAssistantEntry | null;
  shortcut: string;
  isConnected: boolean;
  connectionError: string;
}