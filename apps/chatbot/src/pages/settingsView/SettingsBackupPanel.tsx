import { Button, Popconfirm } from 'antd';
import { RotateCcw, Save } from 'lucide-react';

import { SettingsBackupInfo } from '../chatView/types';

interface SettingsBackupPanelProps {
  info: SettingsBackupInfo | null;
  backupBusy: boolean;
  restoreBusy: boolean;
  onBackup: () => void | Promise<void>;
  onRestore: () => void | Promise<void>;
}

interface BackupStatCardProps {
  label: string;
  value: string;
}

const padNumber = (value: number) => String(value).padStart(2, '0');

const formatTimestamp = (timestamp: string | null | undefined, configExists: boolean) => {
  if (!configExists) {
    return 'Not saved yet';
  }

  if (!timestamp) {
    return 'Unknown';
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return `${parsed.getFullYear()}-${padNumber(parsed.getMonth() + 1)}-${padNumber(parsed.getDate())} ${padNumber(parsed.getHours())}:${padNumber(parsed.getMinutes())}`;
};

const BackupStatCard = ({ label, value }: BackupStatCardProps) => {
  return (
    <div
      className="
        rounded-xl border border-zinc-200/80 bg-zinc-50 p-4

        dark:border-white/10 dark:bg-zinc-950/40
      "
    >
      <div
        className="
          text-[11px] font-semibold tracking-[0.18em] text-zinc-500 uppercase

          dark:text-zinc-400
        "
      >
        {label}
      </div>
      <div
        className="
          mt-2 text-sm text-zinc-800

          dark:text-zinc-100
        "
      >
        {value}
      </div>
    </div>
  );
};

export const SettingsBackupPanel = ({
  info,
  backupBusy,
  restoreBusy,
  onBackup,
  onRestore,
}: SettingsBackupPanelProps) => {
  const locationText = info?.configPath || 'Loading settings storage...';
  const lastSavedText = formatTimestamp(info?.lastModifiedAt, Boolean(info?.configExists));
  const profileCountText = info ? `${info.profileCount}` : 'Loading...';
  const activeProfileText = info?.activeProfileName || 'Loading...';

  return (
    <div className="cybercat-panel p-5">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              className="
                text-sm font-semibold text-zinc-900

                dark:text-zinc-100
              "
            >
              Back up &amp; restore
            </h3>
            <p
              className="
                mt-1 text-xs text-zinc-500

                dark:text-zinc-400
              "
            >
              Manage the saved settings store that CyberCat keeps on this machine.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="large" loading={backupBusy} onClick={onBackup} icon={<Save size={14} />}>
              Back up
            </Button>

            <Popconfirm
              title="Restore saved settings?"
              description="This replaces the saved config store and discards unsaved edits on this page. CyberCat keeps a safety snapshot first."
              okText="Restore"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
              onConfirm={onRestore}
              disabled={restoreBusy}
            >
              <Button size="large" loading={restoreBusy} icon={<RotateCcw size={14} />}>
                Restore
              </Button>
            </Popconfirm>
          </div>
        </div>

        <div
          className="
            rounded-xl border border-zinc-200/80 bg-zinc-50 p-4

            dark:border-white/10 dark:bg-zinc-950/40
          "
        >
          <div
            className="
              text-[11px] font-semibold tracking-[0.18em] text-zinc-500 uppercase

              dark:text-zinc-400
            "
          >
            Settings file
          </div>
          <div
            className="
              mt-2 break-all font-mono text-[13px] text-zinc-800

              dark:text-zinc-100
            "
          >
            {locationText}
          </div>
          <p
            className="
              mt-3 text-xs text-zinc-500

              dark:text-zinc-400
            "
          >
            Backup uses the saved config file. Unsaved edits on this page are not included.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BackupStatCard label="Last saved" value={lastSavedText} />
          <BackupStatCard label="Profiles" value={profileCountText} />
          <BackupStatCard label="Active profile" value={activeProfileText} />
        </div>
      </div>
    </div>
  );
};
