import { create } from 'zustand';

import { VoiceOption } from './types';

const DEFAULT_CHAT_SCROLL_PADDING_BOTTOM = 240;

interface ChatUiStateData {
  isSidebarCollapsed: boolean;
  availablePrompts: string[];
  selectedPromptFile: string;
  selectedPromptContent: string;
  voiceOptions: VoiceOption[];
  selectedVoice: string;
  randomVoicePool: string[];
  isWindowMaximized: boolean;
  isTaskRunning: boolean;
  autoPlay: boolean;
  thinkingEnabled: boolean;
  thinkingSupported: boolean;
  chatScrollPaddingBottom: number;
  playingSegmentId: number | null;
  currentReceivingSegmentId: number | null;
}

interface ChatUiState extends ChatUiStateData {
  setUiState: (partial: Partial<ChatUiStateData>) => void;
  toggleSidebar: () => void;
  setAutoPlay: (autoPlay: boolean) => void;
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
  autoPlay: localStorage.getItem('autoPlay') !== 'false',
  thinkingEnabled: false,
  thinkingSupported: false,
  chatScrollPaddingBottom: DEFAULT_CHAT_SCROLL_PADDING_BOTTOM,
  playingSegmentId: null,
  currentReceivingSegmentId: null,
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
}));