import OpenAI from 'openai';
import type { SelectionAssistantConfig } from './config';

export const generateSelectionAssistantResponse = async (
  config: Pick<SelectionAssistantConfig, 'apiKey' | 'baseUrl' | 'model'>,
  prompts: {
    systemPrompt: string;
    userPrompt: string;
  }
): Promise<string> => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
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
  return completion.choices[0]?.message?.content?.trim() ?? '';
};