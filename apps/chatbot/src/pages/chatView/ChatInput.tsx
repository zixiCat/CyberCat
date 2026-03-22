import { Input } from 'antd';
import { Brain, Send } from 'lucide-react';

interface ChatInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  isTaskRunning: boolean;
  handleSendMessage: () => void;
  inputId: string;
  thinkingEnabled: boolean;
  thinkingSupported: boolean;
  setThinkingEnabled: (enabled: boolean) => void;
}

export const ChatInput = ({
  inputText,
  setInputText,
  isTaskRunning,
  handleSendMessage,
  inputId,
  thinkingEnabled,
  thinkingSupported,
  setThinkingEnabled,
}: ChatInputProps) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div
      className="
        border-t border-zinc-100 p-3

        dark:border-zinc-800
      "
    >
      <div
        className="
          rounded-xl border border-zinc-200 bg-white py-2 shadow-sm

          dark:border-zinc-800 dark:bg-zinc-950
        "
      >
        <Input.TextArea
          id={inputId}
          placeholder={
            isTaskRunning ? 'AI is thinking...' : 'Type a message… (Shift+Enter for newline)'
          }
          autoSize={{ minRows: 3, maxRows: 6 }}
          variant="borderless"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isTaskRunning}
          className="
            w-full text-[13px]

            dark:text-gray-200
          "
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setThinkingEnabled(!thinkingEnabled)}
              disabled={isTaskRunning || !thinkingSupported}
              aria-pressed={thinkingEnabled}
              title={thinkingEnabled ? 'Extended reasoning enabled' : 'Extended reasoning disabled'}
              className={`
                inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px]
                font-semibold tracking-[0.08em] uppercase transition-all duration-150

                disabled:cursor-not-allowed disabled:opacity-50

                ${
                  thinkingEnabled
                    ? `
                      ml-2 border-blue-200/80 bg-linear-to-br from-blue-500/12 to-violet-500/12
                      text-blue-700 shadow-sm shadow-blue-500/10

                      hover:border-blue-300/80 hover:from-blue-500/18 hover:to-violet-500/18

                      dark:border-blue-400/20 dark:from-blue-400/12 dark:to-violet-500/14
                      dark:text-blue-200

                      dark:hover:border-blue-300/30
                    `
                    : `
                      ml-2 border-zinc-200/80 bg-white text-zinc-500

                      hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700

                      dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-400

                      dark:hover:border-white/15 dark:hover:bg-zinc-900 dark:hover:text-zinc-200
                    `
                }
              `}
            >
              <Brain size={13} className="opacity-80" />
              <span>Think</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="
                hidden text-[10px] text-gray-300

                sm:inline

                dark:text-white/20
              "
            >
              Shift+Enter for newline
            </span>

            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isTaskRunning}
              className="
                mr-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-linear-to-br
                from-blue-500 to-violet-600 px-3 text-[12px] font-semibold text-white shadow-md
                ring-1 ring-violet-500/10 transition-all duration-150

                hover:from-blue-600 hover:to-violet-700 hover:shadow-lg hover:shadow-violet-500/25

                active:scale-95

                disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none
              "
            >
              <Send size={14} />
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
