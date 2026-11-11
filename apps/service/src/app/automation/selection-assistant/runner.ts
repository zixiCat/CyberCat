import { randomUUID } from 'node:crypto';
import type { SelectionAssistantConfig } from './config';
import type { SelectionAssistantController, SelectionAssistantEntry } from './types';

interface RunnerDependencies {
  config: SelectionAssistantConfig;
  controller: SelectionAssistantController;
  readSelectedText: () => Promise<string>;
  generate: (inputText: string, onDelta: (text: string) => void) => Promise<string>;
  appendOutput: (text: string) => Promise<void>;
  onError: (error: unknown) => void;
}

// Both entry points share the same lock, result lifecycle and output logging.
export const createSelectionAssistantRunner = ({
  config, controller, readSelectedText, generate, appendOutput, onError,
}: RunnerDependencies) => {
  let isRunning = false;

  return (inputText?: string) => {
    if (isRunning) return null;
    isRunning = true;

    let entry: SelectionAssistantEntry = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'loading',
      shortcut: controller.getSnapshot().shortcut,
      inputText: inputText?.trim() ?? '',
      outputText: '',
      model: config.model,
      promptFilePath: config.promptFilePath,
    };
    const publish = (update: Partial<SelectionAssistantEntry>) => {
      entry = { ...entry, ...update };
      controller.publish(entry);
    };
    publish({});

    const completion = Promise.resolve().then(async () => {
      try {
        entry = { ...entry, inputText: inputText === undefined ? (await readSelectedText()).trim() : entry.inputText };
        if (!entry.inputText) {
          throw new Error(inputText === undefined ? 'No selected text was captured.' : 'Enter some text to start the assistant.');
        }
        const outputText = await generate(entry.inputText, (text) => {
          publish({ outputText: text, status: 'streaming' });
        });
        publish({ outputText, status: 'complete' });
        try {
          await appendOutput(outputText);
        } catch (error) {
          onError(error);
        }
      } catch (error) {
        onError(error);
        publish({
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'The selection assistant could not generate a response.',
        });
      } finally {
        isRunning = false;
      }
    });

    return { entry, completion };
  };
};
