import type { SelectionSpeakerConfig } from './config';

const selectionSpeakerEndpointPath = '/services/aigc/multimodal-generation/generation';

const extractErrorMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const message = payloadRecord.message;
  const code = payloadRecord.code;

  if (typeof message === 'string' && typeof code === 'string') {
    return `${code}: ${message}`;
  }

  if (typeof message === 'string') {
    return message;
  }

  return null;
};

const extractAudioBase64 = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const output = payloadRecord.output;

  if (!output || typeof output !== 'object') {
    return null;
  }

  const outputRecord = output as Record<string, unknown>;

  // Case 1: output.data (Common for HttpSpeechSynthesizer)
  if (typeof outputRecord.data === 'string' && outputRecord.data.length > 0) {
    return outputRecord.data;
  }

  // Case 2: output.audio.data (Standard multimodal generation)
  const directAudio = outputRecord.audio;
  if (directAudio && typeof directAudio === 'object') {
    const audioData = (directAudio as Record<string, unknown>).data;
    if (typeof audioData === 'string' && audioData.length > 0) {
      return audioData;
    }
  }

  // Case 3: output.choices[0].message.audio.data (Chat-style multimodal generation)
  const choices = outputRecord.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const firstChoice = choices[0];
    if (firstChoice && typeof firstChoice === 'object') {
      const message = (firstChoice as Record<string, unknown>).message;
      if (message && typeof message === 'object') {
        const audio = (message as Record<string, unknown>).audio;
        if (audio && typeof audio === 'object') {
          const audioData = (audio as Record<string, unknown>).data;
          if (typeof audioData === 'string' && audioData.length > 0) {
            return audioData;
          }
        }
      }
    }
  }

  return null;
};

type WavChunk = {
  readonly offset: number;
  readonly size: number;
  readonly dataOffset: number;
};

const findWavChunk = (audioBuffer: Buffer, chunkName: string, startOffset = 12): WavChunk | null => {
  let offset = startOffset;

  while (offset + 8 <= audioBuffer.length) {
    const currentChunkName = audioBuffer.subarray(offset, offset + 4).toString('ascii');
    const currentChunkSize = audioBuffer.readUInt32LE(offset + 4);

    if (currentChunkName === chunkName) {
      return {
        offset,
        size: currentChunkSize,
        dataOffset: offset + 8,
      };
    }

    offset += 8 + currentChunkSize + (currentChunkSize % 2);
  }

  return null;
};

const normalizeWavHeader = (audioBuffer: Buffer): Buffer => {
  if (audioBuffer.length < 12) {
    return audioBuffer;
  }

  if (audioBuffer.subarray(0, 4).toString('ascii') !== 'RIFF') {
    return audioBuffer;
  }

  if (audioBuffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
    return audioBuffer;
  }

  const normalizedAudioBuffer = Buffer.from(audioBuffer);
  const totalRiffSize = Math.max(0, normalizedAudioBuffer.length - 8);
  normalizedAudioBuffer.writeUInt32LE(totalRiffSize, 4);

  const dataChunk = findWavChunk(normalizedAudioBuffer, 'data');

  if (!dataChunk) {
    return normalizedAudioBuffer;
  }

  const actualDataSize = Math.max(0, normalizedAudioBuffer.length - dataChunk.dataOffset);
  normalizedAudioBuffer.writeUInt32LE(actualDataSize, dataChunk.offset + 4);

  return normalizedAudioBuffer;
};

const readJsonAudio = async (response: Response): Promise<Buffer> => {
  const payload = await response.json();
  const errorMessage = extractErrorMessage(payload);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const audioBase64 = extractAudioBase64(payload);

  if (!audioBase64) {
    throw new Error('DashScope TTS response did not include audio data.');
  }

  return normalizeWavHeader(Buffer.from(audioBase64, 'base64'));
};

const readErrorResponse = async (response: Response): Promise<string> => {
  const responseText = await response.text();

  if (!responseText) {
    return `DashScope TTS request failed with status ${response.status}.`;
  }

  try {
    const payload = JSON.parse(responseText) as unknown;
    const errorMessage = extractErrorMessage(payload);

    if (errorMessage) {
      return `DashScope TTS request failed with status ${response.status}: ${errorMessage}`;
    }
  } catch {
    return `DashScope TTS request failed with status ${response.status}: ${responseText.trim()}`;
  }

  return `DashScope TTS request failed with status ${response.status}: ${responseText.trim()}`;
};

export const synthesizeSpeech = async (
  config: Pick<SelectionSpeakerConfig, 'apiKey' | 'baseUrl' | 'model' | 'voice' | 'languageType'>,
  text: string
): Promise<Buffer> => {
  const response = await fetch(`${config.baseUrl}${selectionSpeakerEndpointPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      input: {
        text,
        voice: config.voice,
        language_type: config.languageType,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorResponse(response));
  }

  return readJsonAudio(response);
};