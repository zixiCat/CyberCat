import { Button, Input, message, Popover, Select } from 'antd';
import { Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSetState } from 'react-use';

import { useTheme } from '../App';
import { loadBackendJson, waitForBackend } from '../backendShared';
import { SettingsProfilesPayload, SettingsProfileSummary } from '../chatView/types';
import { useDeleteHoldButton } from './useDeleteHoldButton';

interface ActionResult {
  ok: boolean;
  error?: string;
}

interface SettingsProfileButtonProps {
  onProfileApplied?: () => Promise<void> | void;
  buttonClassName?: string;
  placement?: 'bottom' | 'bottomLeft' | 'bottomRight' | 'top' | 'topLeft' | 'topRight';
}

const PROFILE_MESSAGE_KEY = 'settings-profile-action';
const BACKEND_RETRY_DELAY_MS = 150;
const DELETE_HOLD_DURATION_MS = 3000;
const DELETE_HOLD_TICK_MS = 50;
const MILLISECONDS_PER_SECOND = 1000;
const HOLD_TIME_PRECISION_DIGITS = 1;
const DELETE_HOLD_SECONDS = DELETE_HOLD_DURATION_MS / MILLISECONDS_PER_SECOND;
const HOLD_PROGRESS_EMPTY = 0;
const HOLD_PROGRESS_COMPLETE = 1;
const HOLD_PROGRESS_PERCENT = 100;
const DELETE_HOLD_FILL_LIGHT = 'rgba(255, 176, 176, 0.72)';
const DELETE_HOLD_FILL_DARK = 'rgba(153, 27, 27, 0.88)';
const EMPTY_PROFILE_COUNT = 0;
const SINGLE_PROFILE_COUNT = 1;

const loadProfilesPayload = async (): Promise<SettingsProfilesPayload> => {
  return loadBackendJson<SettingsProfilesPayload>(
    () => window.backend?.get_settings_profiles?.(),
    'Settings profiles',
  );
};

interface SettingsProfileButtonState {
  open: boolean;
  profiles: SettingsProfileSummary[];
  activeProfileId: string;
  profileNameDraft: string;
  busy: boolean;
}

export const SettingsProfileButton = ({
  onProfileApplied,
  buttonClassName,
  placement = 'bottomRight',
}: SettingsProfileButtonProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { effectiveTheme } = useTheme();
  const [state, setState] = useSetState<SettingsProfileButtonState>({
    open: false,
    profiles: [],
    activeProfileId: '',
    profileNameDraft: '',
    busy: false,
  });
  const { open, profiles, activeProfileId, profileNameDraft, busy } = state;

  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? null;
  const trimmedProfileName = profileNameDraft.trim();
  const hasDuplicateProfileNameForRename = profiles.some((profile) => {
    if (profile.id === activeProfileId) {
      return false;
    }
    return profile.name.trim().toLowerCase() === trimmedProfileName.toLowerCase();
  });
  const hasDuplicateProfileNameForCreate = profiles.some(
    (profile) => profile.name.trim().toLowerCase() === trimmedProfileName.toLowerCase(),
  );
  const createProfileName = hasDuplicateProfileNameForCreate ? '' : trimmedProfileName;
  const canRenameProfile = Boolean(
    activeProfileId &&
      trimmedProfileName &&
      activeProfile?.name !== trimmedProfileName &&
      !hasDuplicateProfileNameForRename,
  );
  const canCreateProfile = !busy;
  const nameValidationMessage =
    trimmedProfileName && hasDuplicateProfileNameForRename ? 'Profile names must be unique.' : null;
  const deleteDisabled = busy || profiles.length <= SINGLE_PROFILE_COUNT || !activeProfileId;
  const deleteHoldFillColor =
    effectiveTheme === 'dark' ? DELETE_HOLD_FILL_DARK : DELETE_HOLD_FILL_LIGHT;

  const syncProfiles = useCallback(async () => {
    const payload = await loadProfilesPayload();
    const nextProfiles = payload.profiles;
    const nextActiveProfileId = payload.activeProfileId;
    const nextActiveProfile = nextProfiles.find((profile) => profile.id === nextActiveProfileId) ?? null;

    setState({
      profiles: nextProfiles,
      activeProfileId: nextActiveProfileId,
      profileNameDraft: nextActiveProfile?.name ?? '',
    });
  }, [setState]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const backend = await waitForBackend({
        retryDelayMs: BACKEND_RETRY_DELAY_MS,
        isCancelled: () => cancelled,
      });

      if (!backend?.get_settings_profiles || cancelled) {
        return;
      }

      try {
        await syncProfiles();
      } catch {
        // ignore transient startup errors
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [syncProfiles]);

  useEffect(() => {
    if (location.pathname === '/settings') {
      setState({ open: false });
    }
  }, [location.pathname, setState]);

  const runProfileAction = async (
    action: () => Promise<string>,
    successText?: string,
    options?: { applyProfile?: boolean },
  ) => {
    setState({ busy: true });
    message.destroy(PROFILE_MESSAGE_KEY);

    try {
      const result = await loadBackendJson<ActionResult>(action, 'Settings profile action');
      if (!result.ok) {
        message.error({
          content: result.error || 'Profile action failed.',
          key: PROFILE_MESSAGE_KEY,
        });
        return;
      }

      await syncProfiles();
      if (options?.applyProfile !== false) {
        await onProfileApplied?.();
      }
      if (successText) {
        message.success({ content: successText, key: PROFILE_MESSAGE_KEY });
      }
    } catch (error: unknown) {
      const text = error instanceof Error ? error.message : 'Profile action failed.';
      message.error({ content: text, key: PROFILE_MESSAGE_KEY });
    } finally {
      setState({ busy: false });
    }
  };

  const handleProfileSelect = async (profileId: string) => {
    const selectSettingsProfile = window.backend?.select_settings_profile;
    if (!selectSettingsProfile || profileId === activeProfileId) {
      return;
    }

    await runProfileAction(() => selectSettingsProfile(profileId));
  };

  const handleProfileCreate = async () => {
    const createSettingsProfile = window.backend?.create_settings_profile;
    if (!createSettingsProfile || !canCreateProfile) {
      return;
    }

    await runProfileAction(() => createSettingsProfile(createProfileName), 'Profile created.');
  };

  const handleProfileRename = async () => {
    const renameSettingsProfile = window.backend?.rename_settings_profile;
    if (!renameSettingsProfile || !activeProfileId || !canRenameProfile) {
      return;
    }

    await runProfileAction(
      () => renameSettingsProfile(activeProfileId, trimmedProfileName),
      'Profile renamed.',
      { applyProfile: false },
    );
  };

  const handleProfileDelete = async () => {
    const deleteSettingsProfile = window.backend?.delete_settings_profile;
    if (!deleteSettingsProfile || !activeProfileId) {
      return;
    }

    await runProfileAction(() => deleteSettingsProfile(activeProfileId), 'Profile deleted.');
  };

  const deleteHold = useDeleteHoldButton({
    durationMs: DELETE_HOLD_DURATION_MS,
    tickMs: DELETE_HOLD_TICK_MS,
    disabled: deleteDisabled,
    onComplete: handleProfileDelete,
  });
  const deleteHoldProgress = deleteHold.progress;

  const handleOpenSettings = () => {
    if (location.pathname === '/settings') {
      return;
    }

    setState({ open: false });
    navigate('/settings', {
      state: { backgroundLocation: location },
    });
  };

  return (
    <Popover
        open={open}
        trigger="click"
        placement={placement}
      onOpenChange={(nextOpen) => setState({ open: nextOpen })}
        content={
          <div className="flex w-[min(30rem,calc(100vw-2rem))] max-w-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className="
                  text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase

                  dark:text-zinc-400
                "
              >
                Settings Profiles
              </div>
              <div
                className="
                  mt-1 text-xs text-zinc-500

                  dark:text-zinc-400
                "
              >
                Switch, create, or rename profiles without opening a full settings section.
              </div>
            </div>
            <span
              className="
                rounded-lg border border-zinc-200/80 bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600

                dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300
              "
            >
              {profiles.length} profile{profiles.length === SINGLE_PROFILE_COUNT ? '' : 's'}
            </span>
          </div>

          <div
            className="
              grid grid-cols-1 gap-4

              md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]
            "
          >
            <div className="space-y-2">
              <label
                className="
                  block text-[11px] font-semibold tracking-[0.18em] text-zinc-500 uppercase

                  dark:text-zinc-400
                "
              >
                Active Profile
              </label>
              <Select
                value={activeProfileId || undefined}
                placeholder="Select a settings profile"
                onChange={handleProfileSelect}
                disabled={busy || profiles.length === EMPTY_PROFILE_COUNT}
                options={profiles.map((profile) => ({
                  label: profile.name,
                  value: profile.id,
                }))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  className="
                    block text-[11px] font-semibold tracking-[0.18em] text-zinc-500 uppercase

                    dark:text-zinc-400
                  "
                >
                  Name
                </label>
                <span
                  className="
                    text-[11px] text-zinc-400

                    dark:text-zinc-500
                  "
                >
                  Enter to rename
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={profileNameDraft}
                  onChange={(event) => setState({ profileNameDraft: event.target.value })}
                  onPressEnter={() => {
                    if (canRenameProfile) {
                      void handleProfileRename();
                    }
                  }}
                  placeholder="Profile name"
                  disabled={busy || !activeProfileId}
                  status={nameValidationMessage ? 'error' : undefined}
                />
                <Button
                  onClick={() => void handleProfileRename()}
                  icon={<Pencil size={14} />}
                  disabled={busy || !canRenameProfile}
                  className="shrink-0"
                  aria-label="Rename active profile"
                />
              </div>
              {nameValidationMessage && (
                <div
                  className="
                    text-[11px] text-rose-500

                    dark:text-rose-400
                  "
                >
                  {nameValidationMessage}
                </div>
              )}
            </div>
          </div>

          <div
            className="
              grid grid-cols-1 gap-2

              sm:grid-cols-3
            "
          >
            <Button
              onClick={() => void handleProfileCreate()}
              icon={<Plus size={14} />}
              disabled={!canCreateProfile}
            >
              New Profile
            </Button>
            <Button
              onClick={handleOpenSettings}
              icon={<Settings size={14} />}
              disabled={location.pathname === '/settings'}
            >
              Open Settings
            </Button>
            <div className="space-y-1">
              <Button
                danger
                icon={<Trash2 size={14} />}
                disabled={deleteDisabled}
                onMouseDown={deleteHold.start}
                onMouseUp={deleteHold.cancel}
                onMouseLeave={deleteHold.cancel}
                onTouchStart={deleteHold.start}
                onTouchEnd={deleteHold.cancel}
                onTouchCancel={deleteHold.cancel}
                onKeyDown={(event) => {
                  if (event.repeat) {
                    return;
                  }

                  if (event.key === ' ' || event.key === 'Enter') {
                    deleteHold.start();
                  }
                }}
                onKeyUp={(event) => {
                  if (event.key === ' ' || event.key === 'Enter') {
                    deleteHold.cancel();
                  }
                }}
                className="w-full"
                style={{
                  background:
                    deleteHoldProgress > HOLD_PROGRESS_EMPTY
                      ? `linear-gradient(90deg, ${deleteHoldFillColor} ${deleteHoldProgress * HOLD_PROGRESS_PERCENT}%, transparent ${deleteHoldProgress * HOLD_PROGRESS_PERCENT}%)`
                      : undefined,
                }}
              >
                {deleteHoldProgress > HOLD_PROGRESS_EMPTY
                  ? `Hold ${Math.max(HOLD_PROGRESS_EMPTY, (HOLD_PROGRESS_COMPLETE - deleteHoldProgress) * DELETE_HOLD_SECONDS).toFixed(HOLD_TIME_PRECISION_DIGITS)}s`
                  : `Hold ${DELETE_HOLD_SECONDS}s to Delete`}
              </Button>
            </div>
          </div>
          </div>
        }
      >
        <Button
          type="text"
          size="small"
          icon={<Settings size={14} />}
          className={buttonClassName}
        >
          <span className="max-w-24 truncate text-[11px]">{activeProfile?.name ?? 'Profiles'}</span>
        </Button>
      </Popover>
  );
};