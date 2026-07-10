export type SelectionAssistantEntry = {
  id: string;
  createdAt: string;
  shortcut: string;
  inputText: string;
  outputText: string;
  errorMessage?: string;
  model: string;
  promptFilePath: string;
};

export type SelectionAssistantSnapshot = {
  entry: SelectionAssistantEntry | null;
  shortcut: string;
};

export type SelectionAssistantListener = (entry: SelectionAssistantEntry) => void;

export type SelectionAssistantController = {
  getSnapshot: () => SelectionAssistantSnapshot;
  publish: (entry: SelectionAssistantEntry) => void;
  subscribe: (listener: SelectionAssistantListener) => () => void;
};