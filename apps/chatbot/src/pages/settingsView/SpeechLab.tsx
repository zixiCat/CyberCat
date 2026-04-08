import { Alert, Button, Input, Select } from 'antd';
import { LoaderCircle, Mic, Play, Square, Upload, Waves } from 'lucide-react';
import { useMemo } from 'react';

import { useAsrTest } from './useAsrTest';
import { useTtsTest } from './useTtsTest';

export const SpeechLab = () => {
  const {
    voiceOptions,
    selectedVoice,
    randomVoicePool,
    ttsText,
    ttsLoading,
    ttsResult,
    ttsAudioSrc,
    setState: setTtsState,
    handleRandomVoicePoolChange,
    handleRunTts,
  } = useTtsTest();

  const {
    asrLoading,
    asrResult,
    selectedAudioName,
    audioPayload,
    asrAudioSrc,
    recording,
    recordingSupportMode,
    fileInputRef,
    handleFileSelection,
    startRecording,
    stopRecording,
    handleRunAsr,
  } = useAsrTest();

  const randomVoiceOptions = useMemo(
    () => voiceOptions.filter((option) => option.value !== 'auto'),
    [voiceOptions],
  );
  const activeModel = useMemo(
    () => randomVoiceOptions[0]?.model || 'qwen-tts-latest',
    [randomVoiceOptions],
  );
  const supportedVoiceNames = useMemo(
    () => randomVoiceOptions.map((option) => option.label),
    [randomVoiceOptions],
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="cybercat-panel p-5">
        <div className="flex items-center gap-2">
          <div className="
            cybercat-icon-tile size-8 text-violet-600

            dark:text-violet-300
          ">
            <Waves size={16} />
          </div>
          <div>
            <h3 className="
              text-sm font-semibold text-zinc-900

              dark:text-zinc-100
            ">TTS Test</h3>
            <p className="
              text-xs text-zinc-500

              dark:text-zinc-400
            ">
              Preview voice output before using it in chat.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          <Alert
            type="info"
            showIcon
            message={
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span>Active model:</span>
                  <span className="cybercat-inline-badge">{activeModel}</span>
                </div>
                <div className="text-xs/5 text-current/80">
                  Supported voices in this model: {supportedVoiceNames.join(', ') || 'Loading...'}
                </div>
              </div>
            }
          />

          <Input.TextArea
            value={ttsText}
            onChange={(event) => setTtsState({ ttsText: event.target.value })}
            rows={4}
            placeholder="Enter text to synthesize"
          />

          <div className="
            flex flex-col gap-3

            md:flex-row md:items-start
          ">
            <div className="flex-1">
              <label className="
                mb-2 block text-sm font-medium text-zinc-500

                dark:text-zinc-400
              ">
                Voice
              </label>
              <Select
                className="w-full"
                value={selectedVoice}
                onChange={(value) => setTtsState({ selectedVoice: value })}
                options={voiceOptions.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
              />
            </div>

            <div className="flex-1">
              <label className="
                mb-2 block text-sm font-medium text-zinc-500

                dark:text-zinc-400
              ">
                Random voice pool
              </label>
              <Select
                mode="multiple"
                className="w-full"
                value={randomVoicePool}
                onChange={(voices) => handleRandomVoicePoolChange(voices)}
                options={randomVoiceOptions.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                placeholder="Empty = all voices"
                disabled={selectedVoice !== 'auto'}
              />
              <div className="
                mt-2 text-xs/5 text-zinc-500

                dark:text-zinc-400
              ">
                Switch the voice selector to Auto to use the random voice pool.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              icon={<Play size={14} />}
              loading={ttsLoading}
              onClick={handleRunTts}
              disabled={ttsLoading || !ttsText.trim()}
              className="cybercat-gradient-button rounded-lg! border-none! shadow-none!"
            >
              {ttsLoading ? 'Running TTS...' : 'Run TTS'}
            </Button>
            <Button
              type="text"
              size="small"
              onClick={() =>
                handleRandomVoicePoolChange(randomVoiceOptions.map((option) => option.value))
              }
              className="rounded-lg!"
              disabled={selectedVoice !== 'auto'}
            >
              Use all voices
            </Button>
          </div>

          {ttsLoading && (
            <div
              aria-live="polite"
              className="
                flex items-start gap-3 rounded-xl border border-blue-200/80 bg-blue-50 px-4 py-3
                text-sm text-blue-900

                dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-100
              "
            >
              <LoaderCircle size={16} className="mt-0.5 shrink-0 animate-spin" />
              <div>
                <div className="font-medium">Synthesizing speech...</div>
                <div className="
                  text-xs text-blue-800/80

                  dark:text-blue-100/70
                ">
                  The audio preview will appear here when the TTS request finishes.
                </div>
              </div>
            </div>
          )}

          {ttsResult && (
            <Alert
              type={ttsResult.ok ? 'success' : 'error'}
              showIcon
              message={
                ttsResult.ok ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Resolved voice:</span>
                    <span className="
                      cybercat-inline-badge text-violet-600

                      dark:text-violet-300
                    ">
                      {ttsResult.voice}
                    </span>
                    <span className="cybercat-inline-badge">{ttsResult.model}</span>
                  </div>
                ) : (
                  ttsResult.error
                )
              }
            />
          )}

          {ttsAudioSrc && ttsResult?.ok && <audio controls className="w-full" src={ttsAudioSrc} />}
        </div>
      </section>

      <section className="cybercat-panel p-5">
        <div className="flex items-center gap-2">
          <div className="
            cybercat-icon-tile size-8 text-emerald-500

            dark:text-emerald-300
          ">
            <Upload size={16} />
          </div>
          <div>
            <h3 className="
              text-sm font-semibold text-zinc-900

              dark:text-zinc-100
            ">ASR Test</h3>
            <p className="
              text-xs text-zinc-500

              dark:text-zinc-400
            ">
              Upload or record audio and verify transcription quality.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelection}
              className="hidden"
            />
            <Button
              icon={<Upload size={14} />}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg! shadow-none!"
            >
              Upload Audio
            </Button>
            <Button
              icon={recording ? <Square size={14} /> : <Mic size={14} />}
              onClick={recording ? stopRecording : startRecording}
              danger={recording}
              className={recording ? 'rounded-lg! shadow-none!' : 'rounded-lg! shadow-none!'}
            >
              {recording ? 'Stop Recording' : 'Record Audio'}
            </Button>
            {selectedAudioName && <span className="cybercat-inline-badge">{selectedAudioName}</span>}
          </div>

          {recordingSupportMode === 'backend-restart-required' && (
            <Alert
              type="warning"
              showIcon
              message="Recording support was added, but this desktop window is still using the old backend. Restart CyberCat and try again."
            />
          )}

          {recordingSupportMode === 'unavailable' && (
            <Alert
              type="info"
              showIcon
              message="Browser recording is not available here. Upload an audio file instead."
            />
          )}

          {asrAudioSrc && audioPayload && <audio controls className="w-full" src={asrAudioSrc} />}

          <Button
            loading={asrLoading}
            onClick={handleRunAsr}
            disabled={!audioPayload}
            className="cybercat-gradient-button w-fit! rounded-lg! border-none! shadow-none!"
          >
            Run ASR
          </Button>

          <Input.TextArea
            rows={5}
            readOnly
            value={asrResult?.ok ? asrResult.text : asrResult?.error || ''}
            placeholder="Transcription result will appear here"
            status={asrResult && !asrResult.ok ? 'error' : undefined}
          />
        </div>
      </section>
    </div>
  );
};