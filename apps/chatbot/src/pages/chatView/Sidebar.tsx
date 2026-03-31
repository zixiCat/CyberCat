import { MessageSquare } from 'lucide-react';

import { useChatSessionStore } from './chatSessionStore';
import { useChatUiStore } from './chatUiStore';

export const Sidebar = () => {
  const sessions = useChatSessionStore((state) => state.sessions);
  const selectedSessionId = useChatSessionStore((state) => state.selectedSessionId);
  const setSelectedSessionId = useChatSessionStore((state) => state.setSelectedSessionId);
  const isCollapsed = useChatUiStore((state) => state.isSidebarCollapsed);

  return (
    <div
      className={`
        flex flex-col overflow-hidden rounded-xl bg-zinc-50 shadow-sm transition-all duration-300
        ease-in-out

        dark:bg-zinc-900

        ${isCollapsed ? 'mr-0 w-0 opacity-0' : 'mr-2 w-48 opacity-100'}
      `}
    >
      <div
        className={`
          flex h-[36px] items-center justify-between px-3 transition-opacity duration-200

          ${isCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'}
        `}
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-blue-500 opacity-80" />
          <span className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
            History
          </span>
        </div>
      </div>
      <div
        className={`
          flex-1 overflow-auto p-2 transition-opacity duration-200

          ${isCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'}
        `}
      >
        {sessions.length === 0 ? (
          <div
            className="
              rounded-lg border border-dashed border-zinc-200 px-2 py-2 text-[11px] leading-relaxed
              text-zinc-400

              dark:border-zinc-700 dark:text-zinc-500
            "
          >
            No chat history yet.
            <br />
            Click + to create a new session.
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => setSelectedSessionId(session.id)}
              className={`
                mb-1 cursor-pointer rounded-lg px-2 py-1.5 text-[11px] transition-all

                ${
                  selectedSessionId === session.id
                    ? `
                      bg-zinc-200/80 font-medium text-zinc-700

                      dark:bg-zinc-700 dark:text-zinc-200
                    `
                    : `
                      text-zinc-400

                      hover:bg-zinc-100

                      dark:text-zinc-500

                      dark:hover:bg-zinc-800
                    `
                }
              `}
            >
              {session.timestamp}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
