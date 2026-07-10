import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { SelectionSpeakerConfig } from './config';

type WavFormat = {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
};

type ParsedWavBuffer = {
  format: WavFormat | null;
  pcmData: Buffer;
};

type AudioState = {
  chunks: Buffer[];
  seenChunkHashes: Set<string>;
  format: WavFormat | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object');
};

const isLikelyBase64Audio = (value: string): boolean => {
  return value.length > 50 && /^[A-Za-z0-9+/=]+$/.test(value);
};

const parseWavBuffer = (buffer: Buffer): ParsedWavBuffer | null => {
  if (buffer.length < 12) {
    return null;
  }

  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }

  let offset = 12;
  let format: WavFormat | null = null;
  let pcmData: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = Math.min(chunkStart + chunkSize, buffer.length);

    if (chunkId === 'fmt ' && chunkStart + 16 <= buffer.length) {
      format = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    }

    if (chunkId === 'data') {
      pcmData = buffer.subarray(chunkStart, chunkEnd);
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!pcmData) {
    return null;
  }

  return {
    format,
    pcmData,
  };
};

const writePcmAsWav = (pcmData: Buffer, format: WavFormat | null): Buffer => {
  const channels = format?.channels ?? 1;
  const sampleRate = format?.sampleRate ?? 24000;
  const bitsPerSample = format?.bitsPerSample ?? 16;
  const blockAlign = format?.blockAlign ?? (channels * bitsPerSample) / 8;
  const byteRate = format?.byteRate ?? sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
};

const appendAudioBase64 = (audioState: AudioState, base64: string): void => {
  const audioBuffer = Buffer.from(base64, 'base64');
  const wav = parseWavBuffer(audioBuffer);

  if (wav) {
    const pcmHash = createHash('sha1').update(wav.pcmData).digest('hex');

    if (audioState.seenChunkHashes.has(pcmHash)) {
      return;
    }

    audioState.seenChunkHashes.add(pcmHash);
    audioState.chunks.push(wav.pcmData);
    audioState.format ??= wav.format;
    return;
  }

  audioState.chunks.push(audioBuffer);
};

const appendAudioField = (audioState: AudioState, value: unknown): void => {
  if (!isRecord(value) || typeof value.data !== 'string' || !value.data) {
    return;
  }

  appendAudioBase64(audioState, value.data);
};

const appendAudioFromContentPart = (audioState: AudioState, value: unknown): void => {
  if (!isRecord(value)) {
    return;
  }

  appendAudioField(audioState, value.audio);

  if (typeof value.text === 'string' && isLikelyBase64Audio(value.text)) {
    appendAudioBase64(audioState, value.text);
  }
};

const appendAudioFromChunk = (audioState: AudioState, chunk: unknown): void => {
  if (!isRecord(chunk)) {
    return;
  }

  appendAudioField(audioState, chunk.audio);

  if (typeof chunk.content === 'string' && isLikelyBase64Audio(chunk.content)) {
    appendAudioBase64(audioState, chunk.content);
  }

  if (!Array.isArray(chunk.choices) || chunk.choices.length === 0) {
    return;
  }

  const firstChoice = chunk.choices[0];

  if (!isRecord(firstChoice)) {
    return;
  }

  appendAudioField(audioState, firstChoice.audio);

  if (isRecord(firstChoice.message)) {
    appendAudioField(audioState, firstChoice.message.audio);
  }

  if (!isRecord(firstChoice.delta)) {
    return;
  }

  appendAudioField(audioState, firstChoice.delta.audio);

  if (typeof firstChoice.delta.content === 'string' && isLikelyBase64Audio(firstChoice.delta.content)) {
    appendAudioBase64(audioState, firstChoice.delta.content);
    return;
  }

  if (Array.isArray(firstChoice.delta.content)) {
    for (const part of firstChoice.delta.content) {
      appendAudioFromContentPart(audioState, part);
    }
  }
};

export const synthesizeSpeech = async (
  config: Pick<SelectionSpeakerConfig, 'apiKey' | 'baseUrl' | 'model' | 'voice'>,
  text: string
): Promise<Buffer> => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
  const audioState: AudioState = {
    chunks: [],
    seenChunkHashes: new Set<string>(),
    format: null,
  };
  const stream = await client.chat.completions.create(
    {
      model: config.model,
      messages: [{ role: 'user' as const, content: text }],
      modalities: ['audio'] as Array<'audio' | 'text'>,
      audio: { format: 'pcm16' as const, voice: config.voice as never },
      stream: true as const,
    }
  );

  for await (const chunk of stream) {
    appendAudioFromChunk(audioState, chunk);
  }

  if (audioState.chunks.length === 0) {
    throw new Error('Selection speaker response did not include audio data.');
  }

  return writePcmAsWav(Buffer.concat(audioState.chunks), audioState.format);
};