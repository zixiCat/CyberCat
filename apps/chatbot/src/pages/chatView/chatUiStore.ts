import { create } from 'zustand';

import { FileIngestTarget, getDefaultFileIngestTargets } from '../fileIngestTargets';
import { FileIngestResult, PromptOption, TaskLogEntry, VoiceOption } from './types';

const DEFAULT_CHAT_SCROLL_PADDING_BOTTOM = 240;
const MAX_TASK_LOG_ENTRIES = 400;

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
  beginTaskLog: (taskId: number) => void;
  appendTaskLogEntry: (entry: TaskLogEntry) => void;
  appendTaskLogEntries: (entries: TaskLogEntry[]) => void;
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
  isTaskLogExpanded: true,
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
  beginTaskLog: (taskId) => {
    set({
      activeTaskLogTaskId: taskId,
      taskLogEntries: [],
      isTaskLogExpanded: true,
    });
  },
  appendTaskLogEntry: (entry) => {
    const message = entry.message.trim();
    if (!message) {
      return;
    }

    set((state) => ({
      activeTaskLogTaskId: entry.taskId,
      taskLogEntries: [...state.taskLogEntries, { ...entry, message }].slice(-MAX_TASK_LOG_ENTRIES),
    }));
  },
  appendTaskLogEntries: (entries) => {
    const normalizedEntries = entries
      .map((entry) => ({ ...entry, message: entry.message.trim() }))
      .filter((entry) => entry.message);

    if (!normalizedEntries.length) {
      return;
    }

    set((state) => ({
      activeTaskLogTaskId: normalizedEntries[normalizedEntries.length - 1].taskId,
      taskLogEntries: [...state.taskLogEntries, ...normalizedEntries].slice(-MAX_TASK_LOG_ENTRIES),
    }));
  },
  clearTaskLog: () => {
    set({ activeTaskLogTaskId: null, taskLogEntries: [] });
  },
  setTaskLogExpanded: (expanded) => {
    set({ isTaskLogExpanded: expanded });
  },
}));