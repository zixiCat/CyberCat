import OpenAI from 'openai';
import type { SelectionSpeakerConfig } from './config';

const CHARACTER_BASED_DELIMITERS = new Set('，。！？；：\n');
const ALPHABET_DELIMITERS = new Set(',.?!~;:\n');
const BOUNDARY_SUFFIXES = new Set(")]}'\"");

const isCharacterBasedCharacter = (value: string): boolean => {
  const codePoint = value.codePointAt(0) ?? 0;

  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x3040 && codePoint <= 0x309f) ||
    (codePoint >= 0x30a0 && codePoint <= 0x30ff)
  );
};

const isCharacterBasedText = (text: string): boolean => {
  const characterBasedCount = [...text].filter(isCharacterBasedCharacter).length;
  const asciiLetterCount = [...text].filter((character) => /[A-Za-z]/.test(character)).length;

  return characterBasedCount > 0 && characterBasedCount >= asciiLetterCount;
};

const isAlphabetBoundary = (text: string, index: number): boolean => {
  if (text[index] === '\n') {
    return true;
  }

  let lookahead = index + 1;
  while (lookahead < text.length && BOUNDARY_SUFFIXES.has(text[lookahead])) {
    lookahead += 1;
  }

  return lookahead >= text.length || /\s/.test(text[lookahead]);
};

export const splitSpeechText = (text: string): string[] => {
  const isCharacterBased = isCharacterBasedText(text);
  const delimiters = isCharacterBased ? CHARACTER_BASED_DELIMITERS : ALPHABET_DELIMITERS;
  const segments: string[] = [];
  let segmentStart = 0;
  let index = 0;

  while (index < text.length) {
    const isBoundary =
      delimiters.has(text[index]) &&
      (isCharacterBased || isAlphabetBoundary(text, index));

    if (!isBoundary) {
      index += 1;
      continue;
    }

    index += 1;
    while (
      index < text.length &&
      (delimiters.has(text[index]) || BOUNDARY_SUFFIXES.has(text[index]))
    ) {
      index += 1;
    }

    const segment = text.slice(segmentStart, index).trim();
    if (segment) {
      segments.push(segment);
    }

    while (index < text.length && /\s/.test(text[index])) {
      index += 1;
    }
    segmentStart = index;
  }

  const trailingSegment = text.slice(segmentStart).trim();
  if (trailingSegment) {
    segments.push(trailingSegment);
  }

  return segments.length > 0 ? segments : [text];
};

export const synthesizeSpeech = async (
  config: Pick<SelectionSpeakerConfig, 'apiKey' | 'baseUrl' | 'model' | 'voice'>,
  text: string,
  signal?: AbortSignal
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
    },
    { signal }
  );

  const audioData = response.choices.find((choice) => choice.message.audio?.data)?.message.audio?.data;

  if (!audioData) {
    throw new Error('The Omni response did not contain audio data.');
  }

  return Buffer.from(audioData, 'base64');
};