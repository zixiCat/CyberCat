import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { useMount, useUnmount } from 'react-use';

import {
  AUDIO_CHANNEL_INDEX,
  AUDIO_CHANNELS,
  AUDIO_SAMPLE_RATE,
  EMPTY_LENGTH,
  PCM_MAX,
} from './chatShared';
import { ChunkSegment, Session } from './types';

interface UseChatAudioOptions {
  autoPlayRef: MutableRefObject<boolean>;
  sessionsRef: MutableRefObject<Session[]>;
  updateSessions: (updater: (prev: Session[]) => Session[]) => void;
}

export const useChatAudio = ({ autoPlayRef, sessionsRef, updateSessions }: UseChatAudioOptions) => {
  const audioContext = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [playingSegmentId, setPlayingSegmentId] = useState<number | null>(null);
  const autoPlayedSegmentsRef = useRef<Set<number>>(new Set());
  const audioQueueRef = useRef<number[]>([]);
  const isAutoPlayingRef = useRef<boolean>(false);
  const currentReceivingSegmentIdRef = useRef<number | null>(null);
  const segmentAudioChunksRef = useRef<Map<number, Float32Array[]>>(new Map());
  const pendingAudioBase64ChunksRef = useRef<Map<number, string[]>>(new Map());
  const playAudio = useCallback(async (segment: ChunkSegment) => {
    const ctx = audioContext.current;
    if (!ctx) {
      return;
    }
    return new Promise<void>((resolve) => {
      if (currentSourceRef.current) {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      }
      const streamedChunks = segmentAudioChunksRef.current.get(segment.id) ?? segment.audioChunks;
      setPlayingSegmentId(segment.id);
      if (streamedChunks && streamedChunks.length > 0) {
        const totalLength = streamedChunks.reduce((acc, chunk) => acc + chunk.length, EMPTY_LENGTH);
        const combinedArray = new Float32Array(totalLength);
        let offset = EMPTY_LENGTH;
        for (const chunk of streamedChunks) {
          combinedArray.set(chunk, offset);
          offset += chunk.length;
        }
        const audioBuffer = ctx.createBuffer(AUDIO_CHANNELS, totalLength, AUDIO_SAMPLE_RATE);
        audioBuffer.getChannelData(AUDIO_CHANNEL_INDEX).set(combinedArray);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
          currentSourceRef.current = null;
          setPlayingSegmentId(null);
          resolve();
        };
        source.start();
        currentSourceRef.current = source;
        return;
      }
      if (segment.audioFile && window.backend) {
        window.backend
          .get_audio_file(segment.audioFile)
          .then(async (base64Wav: string) => {
            if (!base64Wav || !audioContext.current) {
              setPlayingSegmentId(null);
              resolve();
              return;
            }
            const binaryString = window.atob(base64Wav);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.onended = () => {
              currentSourceRef.current = null;
              setPlayingSegmentId(null);
              resolve();
            };
            source.start();
            currentSourceRef.current = source;
          })
          .catch((error: unknown) => {
            console.error('Failed to play audio file:', error);
            setPlayingSegmentId(null);
            resolve();
          });
        return;
      }
      setPlayingSegmentId(null);
      resolve();
    });
  }, []);
  const processAudioQueue = useCallback(async () => {
    if (isAutoPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    isAutoPlayingRef.current = true;

    while (audioQueueRef.current.length > 0) {
      const segmentId = audioQueueRef.current.shift();
      if (segmentId === undefined) {
        continue;
      }

      const allSegments = sessionsRef.current.flatMap((session) =>
        session.tasks.flatMap((task) => task.segments),
      );
      const targetSegment = allSegments.find((segment) => segment.id === segmentId);
      if (targetSegment) {
        await playAudio(targetSegment);
      }
    }
    isAutoPlayingRef.current = false;
  }, [playAudio, sessionsRef]);
  const finalizeSegmentAudio = useCallback(
    (segmentId: number) => {
      const chunks = pendingAudioBase64ChunksRef.current.get(segmentId);
      if (!chunks || chunks.length === 0 || !window.backend) {
        return;
      }

      pendingAudioBase64ChunksRef.current.delete(segmentId);

      window.backend
        .save_audio_chunks(JSON.stringify(chunks))
        .then((filename: string) => {
          if (!filename) {
            return;
          }

          const taskId = Math.floor(segmentId / 10000);
          updateSessions((prev) =>
            prev.map((session) => {
              const taskIndex = session.tasks.findIndex((task) => task.id === taskId);
              if (taskIndex === -1) {
                return session;
              }

              const task = session.tasks[taskIndex];
              const segmentIndex = task.segments.findIndex((segment) => segment.id === segmentId);
              if (segmentIndex === -1) {
                return session;
              }

              const targetSegment = task.segments[segmentIndex];
              if (targetSegment.audioFile === filename && targetSegment.hasAudio) {
                return session;
              }

              const nextSegments = [...task.segments];
              nextSegments[segmentIndex] = {
                ...targetSegment,
                audioFile: filename,
                hasAudio: true,
              };

              const nextTasks = [...session.tasks];
              nextTasks[taskIndex] = { ...task, segments: nextSegments };
              return { ...session, tasks: nextTasks };
            }),
          );
        })
        .catch((error: unknown) => {
          console.error('Failed to finalize audio segment:', error);
        });
    },
    [updateSessions],
  );
  const processAudioChunk = useCallback(
    (segmentId: number, base64Audio: string) => {
      if (!audioContext.current) {
        return;
      }
      const taskId = Math.floor(segmentId / 10000);
      try {
        const binaryString = window.atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = EMPTY_LENGTH; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = EMPTY_LENGTH; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / PCM_MAX;
        }
        const existingChunks = segmentAudioChunksRef.current.get(segmentId) ?? [];
        existingChunks.push(float32Array);
        segmentAudioChunksRef.current.set(segmentId, existingChunks);
        const pendingChunks = pendingAudioBase64ChunksRef.current.get(segmentId) ?? [];
        pendingChunks.push(base64Audio);
        pendingAudioBase64ChunksRef.current.set(segmentId, pendingChunks);
        currentReceivingSegmentIdRef.current = segmentId;
        updateSessions((prev) =>
          prev.map((session) => {
            const taskIndex = session.tasks.findIndex((task) => task.id === taskId);
            if (taskIndex === -1) {
              return session;
            }

            const task = session.tasks[taskIndex];
            const segmentIndex = task.segments.findIndex((segment) => segment.id === segmentId);
            if (segmentIndex !== -1) {
              const targetSegment = task.segments[segmentIndex];
              if (targetSegment.hasAudio) {
                return session;
              }

              const nextSegments = [...task.segments];
              nextSegments[segmentIndex] = { ...targetSegment, hasAudio: true };

              const nextTasks = [...session.tasks];
              nextTasks[taskIndex] = { ...task, segments: nextSegments };
              return { ...session, tasks: nextTasks };
            }

            const nextTasks = [...session.tasks];
            nextTasks[taskIndex] = {
              ...task,
              segments: [...task.segments, { id: segmentId, text: '', hasAudio: true }],
            };

            return { ...session, tasks: nextTasks };
          }),
        );
      } catch (error) {
        console.error('Error processing audio chunk:', error);
      }
    },
    [updateSessions],
  );
  const handleSegmentFinished = useCallback(
    (segmentId: number) => {
      currentReceivingSegmentIdRef.current = null;
      finalizeSegmentAudio(segmentId);

      if (autoPlayRef.current && !autoPlayedSegmentsRef.current.has(segmentId)) {
        autoPlayedSegmentsRef.current.add(segmentId);
        audioQueueRef.current.push(segmentId);
        void processAudioQueue();
      }
    },
    [autoPlayRef, finalizeSegmentAudio, processAudioQueue],
  );
  const finalizePendingSegments = useCallback(() => {
    currentReceivingSegmentIdRef.current = null;
    pendingAudioBase64ChunksRef.current.forEach((_, segmentId) => {
      finalizeSegmentAudio(segmentId);
    });
  }, [finalizeSegmentAudio]);
  const stopAudioPlayback = useCallback(() => {
    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
      currentSourceRef.current.disconnect();
      currentSourceRef.current = null;
    }

    setPlayingSegmentId(null);
    audioQueueRef.current = [];
    isAutoPlayingRef.current = false;
  }, []);
  useMount(() => {
    audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
  });
  useUnmount(() => {
    stopAudioPlayback();
    if (audioContext.current) {
      audioContext.current.close();
    }
  });
  return {
    playingSegmentId,
    currentReceivingSegmentIdRef,
    playAudio,
    processAudioChunk,
    handleSegmentFinished,
    finalizePendingSegments,
    stopAudioPlayback,
  };
};