import { create } from 'zustand';

import { FileIngestTarget, getDefaultFileIngestTargets } from '../fileIngestTargets';
import { FileIngestResult, PromptOption, TaskLogEntry, TaskLogSource, VoiceOption } from './types';

const DEFAULT_CHAT_SCROLL_PADDING_BOTTOM = 240;
const MAX_TASK_LOG_ENTRIES = 500;

const _formatLogTimestamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()} ${pad(d.getMonth() + 1)} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

interface ChatUiStateData {
  isSidebarCollapsed: boolean;
  availablePrompts: PromptOption[];
  selectedPromptFile: string;
  selectedPromptContent: string;
  voiceOptions: VoiceOption[];
  selectedVoice: string;
  randomVoicePool: string[];
  isWindowMaximized: boolean;
  isTaskRunning: boolean;
  fileIngestEnabled: boolean;
  fileIngestTargets: FileIngestTarget[];
  isFileIngestRunning: boolean;
  pendingFileIngestSourceCount: number;
  lastFileIngestResult: FileIngestResult | null;
  autoPlay: boolean;
  thinkingEnabled: boolean;
  thinkingSupported: boolean;
  chatScrollPaddingBottom: number;
  playingSegmentId: number | null;
  currentReceivingSegmentId: number | null;
  activeTaskLogTaskId: number | null;
  taskLogEntries: TaskLogEntry[];
  isTaskLogExpanded: boolean;
}

interface ChatUiState extends ChatUiStateData {
  setUiState: (partial: Partial<ChatUiStateData>) => void;
  toggleSidebar: () => void;
  setAutoPlay: (autoPlay: boolean) => void;
  batchAppendTaskLog: (entries: Array<{ taskId: number; source: TaskLogSource; message: string }>) => void;
  clearTaskLog: () => void;
  setTaskLogExpanded: (expanded: boolean) => void;
}

export const useChatUiStore = create<ChatUiState>((set) => ({
  isSidebarCollapsed: true,
  availablePrompts: [],
  selectedPromptFile: 'Default.md',
  selectedPromptContent: '',
  voiceOptions: [],
  selectedVoice: 'auto',
  randomVoicePool: [],
  isWindowMaximized: false,
  isTaskRunning: false,
  fileIngestEnabled: false,
  fileIngestTargets: getDefaultFileIngestTargets(),
  isFileIngestRunning: false,
  pendingFileIngestSourceCount: 0,
  lastFileIngestResult: null,
  autoPlay: localStorage.getItem('autoPlay') !== 'false',
  thinkingEnabled: false,
  thinkingSupported: false,
  chatScrollPaddingBottom: DEFAULT_CHAT_SCROLL_PADDING_BOTTOM,
  playingSegmentId: null,
  currentReceivingSegmentId: null,
  activeTaskLogTaskId: null,
  taskLogEntries: [],
  isTaskLogExpanded: false,
  setUiState: (partial) => {
    set(partial);
  },
  toggleSidebar: () => {
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }));
  },
  setAutoPlay: (autoPlay) => {
    localStorage.setItem('autoPlay', String(autoPlay));
    set({ autoPlay });
  },
  batchAppendTaskLog: (entries) => {
    if (entries.length === 0) return;
    const timestamp = _formatLogTimestamp();
    const firstTaskId = entries[0].taskId;
    set((state) => ({
      activeTaskLogTaskId: firstTaskId,
      isTaskLogExpanded: state.activeTaskLogTaskId !== firstTaskId ? true : state.isTaskLogExpanded,
      taskLogEntries: [
        ...state.taskLogEntries,
        ...entries.map((e) => ({ taskId: e.taskId, source: e.source, message: e.message, timestamp })),
      ].slice(-MAX_TASK_LOG_ENTRIES),
    }));
  },
  clearTaskLog: () => {
    set({ activeTaskLogTaskId: null, taskLogEntries: [], isTaskLogExpanded: false });
  },
  setTaskLogExpanded: (expanded) => {
    set({ isTaskLogExpanded: expanded });
  },
}));