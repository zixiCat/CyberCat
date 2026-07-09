import type {
  SelectionAssistantController,
  SelectionAssistantEntry,
  SelectionAssistantEvent,
  SelectionAssistantListener,
  SelectionAssistantSnapshot,
  SelectionAssistantStatus,
} from './types';

export const createSelectionAssistantController = (
  initialStatus: SelectionAssistantStatus,
  historyLimit: number,
  initialEntries: SelectionAssistantEntry[] = []
): SelectionAssistantController => {
  const listeners = new Set<SelectionAssistantListener>();
  let status = initialStatus;
  let entries = initialEntries.slice(0, historyLimit);

  const emit = (event: SelectionAssistantEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  return {
    getSnapshot: (): SelectionAssistantSnapshot => ({
      entries: [...entries],
      status,
    }),
    publish: (entry) => {
      entries = [entry, ...entries].slice(0, historyLimit);
      emit({
        type: 'entry',
        entry,
      });
    },
    setStatus: (nextStatus) => {
      status = nextStatus;
      emit({
        type: 'status',
        status,
      });
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
};