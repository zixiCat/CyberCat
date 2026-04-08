import { Button, Tooltip } from 'antd';
import { Copy, Minus, Square, X } from 'lucide-react';

const PRIMARY_MOUSE_BUTTON = 0;

interface WindowControlsProps {
  isDesktopRuntime: boolean;
  isWindowMaximized: boolean;
  startWindowDrag: () => void;
  toggleMaximizeWindow: () => void;
  minimizeWindow: () => void;
  closeWindow: () => void;
}

export const WindowControls = ({
  isDesktopRuntime,
  isWindowMaximized,
  startWindowDrag,
  toggleMaximizeWindow,
  minimizeWindow,
  closeWindow,
}: WindowControlsProps) => {
  const cyberCatLogoSrc = 'CyberCat.png';

  return (
    <div
      className="
        flex items-center justify-between gap-3 border-b border-zinc-200/80 pb-2

        dark:border-white/10
      "
    >
      <div
        className="
          flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-lg p-1 select-none
        "
        onMouseDown={(event) => {
          if (event.button !== PRIMARY_MOUSE_BUTTON || !isDesktopRuntime) {
            return;
          }
          event.preventDefault();
          startWindowDrag();
        }}
        onDoubleClick={() => {
          if (!isDesktopRuntime) {
            return;
          }
          toggleMaximizeWindow();
        }}
      >
        <img
          src={cyberCatLogoSrc}
          alt="CyberCat"
          className="size-6 shrink-0 rounded-md object-cover"
          draggable={false}
        />
        <span
          className="
            truncate bg-linear-to-r from-blue-500 to-violet-600 bg-clip-text text-[11px] font-bold
            tracking-[0.28em] text-transparent uppercase italic
          "
        >
          CyberCat
        </span>
      </div>

      {isDesktopRuntime && (
        <div className="flex items-center gap-1">
          <Tooltip title="Minimize">
            <Button
              type="text"
              size="small"
              onClick={minimizeWindow}
              icon={<Minus size={14} />}
              className="
                hover:bg-zinc-200/70

                dark:hover:bg-white/10
              "
            />
          </Tooltip>
          <Tooltip title={isWindowMaximized ? 'Restore' : 'Maximize'}>
            <Button
              type="text"
              size="small"
              onClick={toggleMaximizeWindow}
              icon={isWindowMaximized ? <Copy size={13} /> : <Square size={12} />}
              className="
                hover:bg-zinc-200/70

                dark:hover:bg-white/10
              "
            />
          </Tooltip>
          <Tooltip title="Close">
            <Button
              type="text"
              size="small"
              onClick={closeWindow}
              icon={<X size={14} />}
              className="
                hover:bg-red-100 hover:text-red-600

                dark:hover:bg-red-500/20
              "
            />
          </Tooltip>
        </div>
      )}
    </div>
  );
};
