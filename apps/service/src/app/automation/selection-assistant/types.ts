export type SelectionAssistantEntry = {
  readonly id: string;
  readonly createdAt: string;
  readonly shortcut: string;
  readonly inputText: string;
  readonly outputText: string;
  readonly errorMessage?: string;
  readonly model: string;
  readonly promptFilePath: string;
};

export type SelectionAssistantSnapshot = {
  readonly entry: SelectionAssistantEntry | null;
  readonly shortcut: string;
};

export type SelectionAssistantListener = (entry: SelectionAssistantEntry) => void;

export type SelectionAssistantController = {
  readonly getSnapshot: () => SelectionAssistantSnapshot;
  readonly publish: (entry: SelectionAssistantEntry) => void;
  readonly subscribe: (listener: SelectionAssistantListener) => () => void;
};