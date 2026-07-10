import OpenAI from 'openai';
import type { SelectionSpeakerConfig } from './config';

export const synthesizeSpeech = async (
  config: Pick<SelectionSpeakerConfig, 'apiKey' | 'baseUrl' | 'model' | 'voice'>,
  text: string
): Promise<Buffer> => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  const response = await client.chat.completions.create(
    {
      model: config.model,
      messages: [
        { role: 'user' as const, content: `Just repeat: ${text}` }],
      modalities: ['text', 'audio'] as Array<'audio' | 'text'>,
      audio: { format: 'pcm16' as const, voice: config.voice as never },
      stream: false,
    }
  );

  return Buffer.from(response.choices?.[1]?.message?.audio?.data || '', 'base64');
};