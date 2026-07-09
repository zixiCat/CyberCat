import type { SelectionAssistantConfig } from './config';

const readObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as Record<string, unknown>;
};

const extractMessageContent = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((part) => {
      const partRecord = readObject(part);

      if (!partRecord) {
        return '';
      }

      return typeof partRecord.text === 'string' ? partRecord.text : '';
    })
    .join('\n')
    .trim();
};

const extractCompletionText = (payload: unknown): string => {
  const payloadRecord = readObject(payload);
  const choices = payloadRecord?.choices;

  if (!Array.isArray(choices) || choices.length === 0) {
    return '';
  }

  const firstChoice = readObject(choices[0]);
  const message = readObject(firstChoice?.message);

  return extractMessageContent(message?.content);
};

const readApiError = (payload: unknown): string | null => {
  const payloadRecord = readObject(payload);

  if (!payloadRecord) {
    return null;
  }

  const errorRecord = readObject(payloadRecord.error);
  const errorMessage = errorRecord?.message;

  if (typeof errorMessage === 'string' && errorMessage.trim()) {
    return errorMessage.trim();
  }

  const message = payloadRecord.message;

  return typeof message === 'string' && message.trim() ? message.trim() : null;
};

const readErrorResponse = async (response: Response): Promise<string> => {
  const responseText = await response.text();

  if (!responseText.trim()) {
    return `Selection assistant request failed with status ${response.status}.`;
  }

  try {
    const payload = JSON.parse(responseText) as unknown;
    const errorMessage = readApiError(payload);

    if (errorMessage) {
      return `Selection assistant request failed with status ${response.status}: ${errorMessage}`;
    }
  } catch {
    return `Selection assistant request failed with status ${response.status}: ${responseText.trim()}`;
  }

  return `Selection assistant request failed with status ${response.status}: ${responseText.trim()}`;
};

export const generateSelectionAssistantResponse = async (
  config: Pick<SelectionAssistantConfig, 'apiKey' | 'baseUrl' | 'model' | 'requestTimeoutMs'>,
  prompts: {
    readonly systemPrompt: string;
    readonly userPrompt: string;
  }
): Promise<string> => {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: prompts.systemPrompt,
          },
          {
            role: 'user',
            content: prompts.userPrompt,
          },
        ],
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(await readErrorResponse(response));
    }

    const payload = (await response.json()) as unknown;
    const text = extractCompletionText(payload);

    if (!text) {
      throw new Error('Selection assistant response did not include any text output.');
    }

    return text;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Selection assistant request timed out.');
    }

    throw err;
  } finally {
    clearTimeout(timer);
  }
};