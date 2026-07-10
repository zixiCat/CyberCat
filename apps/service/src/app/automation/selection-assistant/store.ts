import type {
  SelectionAssistantController,
  SelectionAssistantEntry,
  SelectionAssistantListener,
  SelectionAssistantSnapshot,
} from './types';

export const createSelectionAssistantController = (
  shortcut: string,
  initialEntry: SelectionAssistantEntry | null = null
): SelectionAssistantController => {
  const listeners = new Set<SelectionAssistantListener>();
  let entry = initialEntry;

  return {
    getSnapshot: (): SelectionAssistantSnapshot => ({
      entry,
      shortcut,
    }),
    publish: (nextEntry) => {
      entry = nextEntry;
      for (const listener of listeners) {
        listener(nextEntry);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
};