import OpenAI from 'openai';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { SelectionSpeakerConfig } from './config';

type AudioDelta = { data?: string };
type AudioCompletionChunk = ChatCompletionChunk & {
  audio?: AudioDelta;
  choices: Array<ChatCompletionChunk.Choice & {
    delta: ChatCompletionChunk.Choice.Delta & { audio?: AudioDelta };
  }>;
};

const getAudioData = (chunk: ChatCompletionChunk): string | undefined => {
  const audioChunk = chunk as AudioCompletionChunk;
  const delta = audioChunk.choices[0]?.delta;

  return audioChunk.audio?.data ?? delta?.audio?.data ?? delta?.content ?? undefined;
};

const decodeAudioStream = async function* (
  stream: AsyncIterable<ChatCompletionChunk>,
  onFirstAudio?: () => void
): AsyncGenerator<Buffer> {
  let receivedAudio = false;

  for await (const chunk of stream) {
    const audioData = getAudioData(chunk);

    if (!audioData) {
      continue;
    }

    if (!receivedAudio) {
      receivedAudio = true;
      onFirstAudio?.();
    }

    yield Buffer.from(audioData, 'base64');
  }

  if (!receivedAudio) {
    throw new Error('The Omni response did not contain audio data.');
  }
};

export const synthesizeSpeech = async (
  config: Pick<SelectionSpeakerConfig, 'apiKey' | 'baseUrl' | 'model' | 'voice'>,
  text: string,
  signal?: AbortSignal,
  onFirstAudio?: () => void
): Promise<AsyncIterable<Buffer>> => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  const stream = await client.chat.completions.create(
    {
      model: config.model,
      messages: [{ role: 'user' as const, content: `Just repeat: ${text}` }],
      modalities: ['audio'],
      audio: { format: 'pcm16' as const, voice: config.voice as never },
      stream: true,
    },
    { signal }
  );

  return decodeAudioStream(stream, onFirstAudio);
};