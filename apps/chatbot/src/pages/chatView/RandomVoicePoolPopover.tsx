import { Button, Popover, Select, Tooltip } from 'antd';
import { Shuffle } from 'lucide-react';

import { VoiceOption } from './types';

interface RandomVoicePoolPopoverProps {
  selectedVoice: string;
  randomVoicePool: string[];
  voiceOptions: VoiceOption[];
  onPoolChange: (voices: string[]) => void;
}

export const RandomVoicePoolPopover = ({
  selectedVoice,
  randomVoicePool,
  voiceOptions,
  onPoolChange,
}: RandomVoicePoolPopoverProps) => {
  const EMPTY_VOICE_COUNT = 0;
  const hasCustomRandomVoicePool = randomVoicePool.length > EMPTY_VOICE_COUNT;
  const randomVoiceOptions = voiceOptions.filter((option) => option.value !== 'auto');

  return (
    <Popover
      trigger="click"
      placement="bottom"
      content={
        <div className="flex w-64 flex-col gap-3">
          <div>
            <div
              className="
                text-[11px] font-medium text-zinc-700

                dark:text-zinc-200
              "
            >
              Random voice pool
            </div>
            <div
              className="
                mt-1 text-[10px] text-zinc-500

                dark:text-zinc-400
              "
            >
              Auto will only pick from these voices. Switch the voice selector to Auto to use this pool.
            </div>
          </div>

          <Select
            mode="multiple"
            size="small"
            value={randomVoicePool}
            options={randomVoiceOptions.map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            onChange={(voices) => onPoolChange(voices)}
            placeholder="Use all voices"
            className="w-full"
            disabled={selectedVoice !== 'auto'}
          />

          <div className="flex items-center justify-between gap-2">
            <Button
              size="small"
              type="text"
              onClick={() =>
                onPoolChange(randomVoiceOptions.map((option) => option.value))
              }
              disabled={selectedVoice !== 'auto'}
            >
              Select all
            </Button>
            <Button
              size="small"
              type="text"
              onClick={() => onPoolChange([])}
              disabled={selectedVoice !== 'auto'}
            >
              Clear
            </Button>
          </div>
        </div>
      }
    >
      <Tooltip
        title={
          selectedVoice === 'auto'
            ? hasCustomRandomVoicePool
              ? `Random pool: ${randomVoicePool.length} voices`
              : 'Random pool: all voices'
            : 'Random pool is available when voice is set to Auto'
        }
      >
        <Button
          type="text"
          size="small"
          icon={<Shuffle size={14} className="opacity-80" />}
          className="
            text-zinc-500

            hover:text-blue-500

            dark:text-zinc-400
          "
        >
          <span className="text-[10px]">
            {hasCustomRandomVoicePool ? randomVoicePool.length : 'All'}
          </span>
        </Button>
      </Tooltip>
    </Popover>
  );
};
