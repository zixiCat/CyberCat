import OpenAI from 'openai';
import type { SelectionAssistantConfig } from './config';

export const generateSelectionAssistantResponse = async (
  config: Pick<SelectionAssistantConfig, 'apiKey' | 'baseUrl' | 'model'>,
  prompts: {
    systemPrompt: string;
    userPrompt: string;
  },
  onDelta: (outputText: string) => void
): Promise<string> => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
  const stream = await client.chat.completions.create({
    model: config.model,
    temperature: 0.2,
    stream: true,
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

  let outputText = '';

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';

    if (!delta) {
      continue;
    }

    outputText += delta;
    onDelta(outputText);
  }

  return outputText.trim();
};