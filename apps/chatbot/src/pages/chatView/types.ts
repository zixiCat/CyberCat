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

export interface PromptOption {
  file: string;
  name: string;
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

export type BilibiliAuthState = 'not_configured' | 'configured' | 'authenticated' | 'logged_out';

export interface BilibiliAuthStatus {
  configured: boolean;
  state: BilibiliAuthState;
  remoteChecked: boolean;
  hasSessData: boolean;
  userId: string;
  username: string;
  expiresAt: string | null;
  checkedAt?: string;
  remoteError?: string;
}

export type BilibiliQrLoginState = 'waiting_scan' | 'waiting_confirm' | 'expired' | 'success';

export interface BilibiliQrLoginResult {
  ok: boolean;
  state?: BilibiliQrLoginState;
  sessionId?: string;
  qrUrl?: string;
  expiresInSeconds?: number;
  status?: BilibiliAuthStatus;
  error?: string;
}

export interface FileIngestStartPayload {
  ok: boolean;
  jobId: string;
  sourceCount: number;
  files: string[];
  targetFolders: string[];
}

export interface FileIngestOutputSummary {
  folderPath: string;
  noteRelativePath: string;
  purpose: string;
}

export interface FileIngestResult {
  ok: boolean;
  jobId: string;
  collectedAt?: string;
  archiveRelativePath?: string;
  sourceCount?: number;
  outputCount?: number;
  outputs?: FileIngestOutputSummary[];
  warnings?: string[];
  summary?: string;
  error?: string;
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
  stop_task?: () => void;
  start_file_ingest?: (pathsJson: string) => Promise<string>;
  start_tts_test?: (requestId: string, text: string, voice: string) => void;
  start_asr_test_recording?: () => Promise<string>;
  stop_asr_test_recording?: () => Promise<string>;
  start_drag?: () => void;
  minimize_window?: () => void;
  maximize_window?: () => void;
  close_window?: () => void;
  get_config_status?: () => Promise<string>;
  get_available_prompts?: () => Promise<string>;
  get_prompt_content?: (file: string) => Promise<string>;
  set_active_system_prompt?: (content: string) => void;
  load_sessions?: () => Promise<string>;
  save_session?: (sessionId: string, sessionJson: string) => void | Promise<void>;
  delete_session?: (sessionId: string) => void | Promise<void>;
  get_audio_file?: (filename: string) => Promise<string>;
  save_audio_chunks?: (chunksJson: string) => Promise<string>;
  get_settings?: () => Promise<string>;
  save_settings?: (settingsJson: string) => Promise<string>;
  get_bilibili_auth_status?: () => Promise<string>;
  start_bilibili_qr_login?: () => Promise<string>;
  poll_bilibili_qr_login?: (sessionId: string) => Promise<string>;
  get_settings_profiles?: () => Promise<string>;
  create_settings_profile?: (profileName: string) => Promise<string>;
  rename_settings_profile?: (profileId: string, profileName: string) => Promise<string>;
  delete_settings_profile?: (profileId: string) => Promise<string>;
  select_settings_profile?: (profileId: string) => Promise<string>;
  get_voice_options?: () => Promise<string>;
  get_active_voice?: () => Promise<string>;
  set_active_voice?: (voice: string) => void | Promise<void>;
  get_random_voice_pool?: () => Promise<string>;
  set_random_voice_pool?: (voicesJson: string) => void | Promise<void>;
  transcribe_audio_base64?: (audioBase64: string, extension: string) => Promise<string>;
  task_started?: SignalHandler<[number, string]>;
  segment_text_chunk?: SignalHandler<[number, string]>;
  segment_audio_chunk?: SignalHandler<[number, string]>;
  segment_finished?: SignalHandler<[number]>;
  task_finished?: SignalHandler<[]>;
  tts_test_started?: SignalHandler<[string]>;
  tts_test_finished?: SignalHandler<[string, string]>;
  file_ingest_started?: SignalHandler<[string]>;
  file_ingest_finished?: SignalHandler<[string]>;
  window_state_changed?: SignalHandler<[boolean]>;
  [key: string]: unknown;
}

export interface ChatBackendSignalHandlers {
  onTaskStarted?: (taskId: number, prompt: string) => void;
  onSegmentTextChunk?: (segmentId: number, chunk: string) => void;
  onSegmentAudioChunk?: (segmentId: number, audioBase64: string) => void;
  onSegmentFinished?: (segmentId: number) => void;
  onTaskFinished?: () => void;
  onFileIngestStarted?: (payloadJson: string) => void;
  onFileIngestFinished?: (payloadJson: string) => void;
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
