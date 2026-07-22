import * as path from 'node:path';

export type SelectionAssistantConfig = {
  shortcut: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  promptFilePath: string;
  logFilePath: string;
};

const resolvePath = (value: string): string => {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
};

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

const defaultPromptFilePath = path.resolve(__dirname, '../../../assets/selection-assistant.prompt.md');

const resolvePromptFilePath = (value: string | undefined): string => {
  const normalizedValue = value?.trim();

  return normalizedValue ? resolvePath(normalizedValue) : defaultPromptFilePath;
};

export const readSelectionAssistantConfig = (env: NodeJS.ProcessEnv = process.env): SelectionAssistantConfig => ({
  shortcut: env.SELECTION_ASSISTANT_SHORTCUT?.trim() || '',
  apiKey: env.SELECTION_ASSISTANT_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || '',
  baseUrl: normalizeBaseUrl(env.SELECTION_ASSISTANT_BASE_URL?.trim() || ''),
  model: env.SELECTION_ASSISTANT_MODEL?.trim() || 'gpt-4.1-mini',
  promptFilePath: resolvePromptFilePath(env.SELECTION_ASSISTANT_PROMPT_PATH),
  logFilePath: resolvePath(env.SELECTION_ASSISTANT_LOG_PATH?.trim() || 'tmp/selection-assistant-log.md'),
});