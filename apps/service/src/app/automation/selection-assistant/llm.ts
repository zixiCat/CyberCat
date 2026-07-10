import OpenAI from 'openai';
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

export const generateSelectionAssistantResponse = async (
  config: Pick<SelectionAssistantConfig, 'apiKey' | 'baseUrl' | 'model' | 'requestTimeoutMs'>,
  prompts: {
    readonly systemPrompt: string;
    readonly userPrompt: string;
  }
): Promise<string> => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: config.requestTimeoutMs,
  });
  const completion = await client.chat.completions.create({
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
  });
  const text = extractMessageContent(completion.choices[0]?.message?.content);

  if (!text) {
    throw new Error('Selection assistant response did not include any text output.');
  }

  return text;
};