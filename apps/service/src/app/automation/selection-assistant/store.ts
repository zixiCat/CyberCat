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
  initialEntry: SelectionAssistantEntry | null = null
): SelectionAssistantController => {
  const listeners = new Set<SelectionAssistantListener>();
  let status = initialStatus;
  let entry = initialEntry;

  const emit = (event: SelectionAssistantEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  return {
    getSnapshot: (): SelectionAssistantSnapshot => ({
      entry,
      status,
    }),
    publish: (nextEntry) => {
      entry = nextEntry;
      emit({
        type: 'entry',
        entry: nextEntry,
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