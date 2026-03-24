export interface ChunkSegment {
  id: number;
  text: string;
  audioChunks?: Float32Array[];
  audioFile?: string;
  hasAudio?: boolean;
}

export interface Task {
  id: number;
  prompt: string;
  segments: ChunkSegment[];
  timestamp: string;
}

export interface Session {
  id: string;
  timestamp: string;
  tasks: Task[];
  systemPromptFile?: string;
}

export interface VoiceOption {
  label: string;
  value: string;
  model: string;
}

export interface TtsTestResult {
  ok: boolean;
  audioBase64?: string;
  voice?: string;
  model?: string;
  error?: string;
}

export interface AsrTestResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export interface SettingsProfileSummary {
  id: string;
  name: string;
}

export interface SettingsProfilesPayload {
  activeProfileId: string;
  profiles: SettingsProfileSummary[];
}

export interface SignalHandler<TArgs extends unknown[] = unknown[]> {
  connect: (callback: (...args: TArgs) => void) => void;
}

export interface SpeechLabBackendSignalHandlers {
  onTtsTestStarted?: (requestId: string) => void;
  onTtsTestFinished?: (requestId: string, resultJson: string) => void;
}

export interface BackendBridge {
  start_task?: (text: string, systemPrompt?: string, historyJson?: string) => void;
  start_tts_test?: (requestId: string, text: string, voice: string) => void;
  start_asr_test_recording?: () => Promise<string>;
  stop_asr_test_recording?: () => Promise<string>;
  start_drag?: () => void;
  minimize_window?: () => void;
  maximize_window?: () => void;
  close_window?: () => void;
  get_settings?: () => Promise<string>;
  save_settings?: (settingsJson: string) => Promise<string>;
  get_settings_profiles?: () => Promise<string>;
  create_settings_profile?: (profileName: string) => Promise<string>;
  rename_settings_profile?: (profileId: string, profileName: string) => Promise<string>;
  delete_settings_profile?: (profileId: string) => Promise<string>;
  select_settings_profile?: (profileId: string) => Promise<string>;
  tts_test_started?: SignalHandler<[string]>;
  tts_test_finished?: SignalHandler<[string, string]>;
  window_state_changed?: SignalHandler<[boolean]>;
  [key: string]: any;
}

export interface ChatBackendSignalHandlers {
  onTaskStarted?: (taskId: number, prompt: string) => void;
  onSegmentTextChunk?: (segmentId: number, chunk: string) => void;
  onSegmentAudioChunk?: (segmentId: number, audioBase64: string) => void;
  onSegmentFinished?: (segmentId: number) => void;
  onTaskFinished?: () => void;
  onWindowStateChanged?: (maximized: boolean) => void;
}

declare global {
  interface Window {
    backend?: BackendBridge;
    qt?: any;
    QWebChannel?: any;
    webChannelInitializing?: boolean;
    webChannel?: any;
    cyberCatBackendSignalsBound?: boolean;
    cyberCatBackendSignalHandlers?: ChatBackendSignalHandlers;
    cyberCatSpeechLabSignalsBound?: boolean;
    cyberCatSpeechLabSignalHandlers?: SpeechLabBackendSignalHandlers;
  }
}
