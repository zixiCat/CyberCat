import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import ffplayStatic = require('ffplay-static');

const PCM_SAMPLE_RATE = 24_000;
const PCM_CHANNEL_COUNT = 1;
const PCM_BITS_PER_SAMPLE = 16;
const STARTUP_BUFFER_MS = 500;
const EDGE_PADDING_MS = 500;

const PCM_BYTES_PER_SAMPLE = PCM_BITS_PER_SAMPLE / 8;
const PCM_BYTES_PER_SECOND = PCM_SAMPLE_RATE * PCM_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE;
const STARTUP_BUFFER_BYTES = PCM_BYTES_PER_SECOND * STARTUP_BUFFER_MS / 1_000;
const EDGE_SILENCE = Buffer.alloc(PCM_BYTES_PER_SECOND * EDGE_PADDING_MS / 1_000);

const startFfplay = (): ChildProcessWithoutNullStreams => {
  const playbackProcess = spawn(ffplayStatic.default, [
    '-nodisp',
    '-autoexit',
    '-loglevel', 'error',
    '-f', 's16le',
    '-ar', String(PCM_SAMPLE_RATE),
    '-ac', String(PCM_CHANNEL_COUNT),
    '-i', 'pipe:0',
  ]);

  playbackProcess.stdout.resume();
  playbackProcess.stderr.resume();
  return playbackProcess;
};

const writePcm = async (
  playbackProcess: ChildProcessWithoutNullStreams,
  pcm: Buffer
): Promise<void> => {
  if (!playbackProcess.stdin.write(pcm)) {
    await once(playbackProcess.stdin, 'drain');
  }
};

export const extractPcm16 = (audioData: Buffer): Buffer => {
  const isWav =
    audioData.length >= 12 &&
    audioData.toString('ascii', 0, 4) === 'RIFF' &&
    audioData.toString('ascii', 8, 12) === 'WAVE';

  if (!isWav) {
    return audioData;
  }

  let offset = 12;
  while (offset + 8 <= audioData.length) {
    const chunkName = audioData.toString('ascii', offset, offset + 4);
    const chunkSize = audioData.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkName === 'data') {
      return audioData.subarray(chunkStart, Math.min(chunkStart + chunkSize, audioData.length));
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  throw new Error('WAV audio delta has no data chunk.');
};

export type AudioPlayback = {
  play: (audioChunks: AsyncIterable<Buffer>) => Promise<void>;
  stop: () => void;
};

export const createAudioPlayback = (): AudioPlayback => {
  let activeProcess: ChildProcessWithoutNullStreams | null = null;

  const stop = (): void => {
    activeProcess?.stdin.destroy();
    activeProcess?.kill();
    activeProcess = null;
  };

  const play = async (audioChunks: AsyncIterable<Buffer>): Promise<void> => {
    stop();

    let bufferedBytes = 0;
    let startupChunks: Buffer[] = [];
    let playbackProcess: ChildProcessWithoutNullStreams | null = null;

    for await (const audioChunk of audioChunks) {
      const pcm = extractPcm16(audioChunk);

      if (!playbackProcess) {
        startupChunks.push(pcm);
        bufferedBytes += pcm.length;

        if (bufferedBytes < STARTUP_BUFFER_BYTES) {
          continue;
        }

        playbackProcess = startFfplay();
        activeProcess = playbackProcess;
        await writePcm(playbackProcess, Buffer.concat([EDGE_SILENCE, ...startupChunks]));
        startupChunks = [];
        continue;
      }

      await writePcm(playbackProcess, pcm);
    }

    if (!playbackProcess && startupChunks.length > 0) {
      playbackProcess = startFfplay();
      activeProcess = playbackProcess;
      await writePcm(playbackProcess, Buffer.concat([EDGE_SILENCE, ...startupChunks]));
    }

    if (!playbackProcess) {
      return;
    }

    await writePcm(playbackProcess, EDGE_SILENCE);
    playbackProcess.stdin.end();
    const [exitCode] = await once(playbackProcess, 'close');

    if (activeProcess === playbackProcess) {
      activeProcess = null;
    }

    if (exitCode !== 0 && exitCode !== null) {
      throw new Error(`Audio playback exited with code ${exitCode}.`);
    }
  };

  return { play, stop };
};