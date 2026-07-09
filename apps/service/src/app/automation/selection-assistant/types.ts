export type SelectionAssistantRuntimeState = 'idle' | 'busy' | 'disabled' | 'unsupported' | 'misconfigured';

export type SelectionAssistantEntry = {
  readonly id: string;
  readonly createdAt: string;
  readonly status: 'success' | 'error';
  readonly shortcut: string;
  readonly inputText: string;
  readonly outputText: string;
  readonly errorMessage?: string;
  readonly model: string;
  readonly promptFilePath: string;
  readonly logFilePath: string;
  readonly logSaved: boolean;
  readonly logErrorMessage?: string;
};

export type SelectionAssistantStatus = {
  readonly state: SelectionAssistantRuntimeState;
  readonly message: string;
  readonly shortcut: string;
  readonly model: string;
  readonly promptFilePath: string;
  readonly logFilePath: string;
};

export type SelectionAssistantSnapshot = {
  readonly entries: SelectionAssistantEntry[];
  readonly status: SelectionAssistantStatus;
};

export type SelectionAssistantEvent =
  | {
      readonly type: 'entry';
      readonly entry: SelectionAssistantEntry;
    }
  | {
      readonly type: 'status';
      readonly status: SelectionAssistantStatus;
    };

export type SelectionAssistantListener = (event: SelectionAssistantEvent) => void;

export type SelectionAssistantController = {
  readonly getSnapshot: () => SelectionAssistantSnapshot;
  readonly publish: (entry: SelectionAssistantEntry) => void;
  readonly setStatus: (status: SelectionAssistantStatus) => void;
  readonly subscribe: (listener: SelectionAssistantListener) => () => void;
};