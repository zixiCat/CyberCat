import * as path from 'node:path';

export type SelectionAssistantConfig = {
  readonly shortcut: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly promptFilePath: string;
  readonly logFilePath: string;
  readonly requestTimeoutMs: number;
};

const readPositiveInteger = (value: string | undefined, fallbackValue: number): number => {
  const parsedValue = Number(value?.trim());

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return Math.trunc(parsedValue);
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
  shortcut: env.SELECTION_ASSISTANT_SHORTCUT?.trim() || 'Ctrl+Shift+9',
  apiKey: env.SELECTION_ASSISTANT_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || '',
  baseUrl: normalizeBaseUrl(env.SELECTION_ASSISTANT_BASE_URL?.trim() || env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1'),
  model: env.SELECTION_ASSISTANT_MODEL?.trim() || 'gpt-4.1-mini',
  promptFilePath: resolvePromptFilePath(env.SELECTION_ASSISTANT_PROMPT_PATH),
  logFilePath: resolvePath(env.SELECTION_ASSISTANT_LOG_PATH?.trim() || 'tmp/selection-assistant-log.jsonl'),
  requestTimeoutMs: readPositiveInteger(env.SELECTION_ASSISTANT_REQUEST_TIMEOUT_MS, 60_000),
});