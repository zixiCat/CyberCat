import { Alert, Button, QRCode } from 'antd';
import {
  QrCode,
  RefreshCw,
  ScanQrCode,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useEffect } from 'react';
import { useMount,useSetState } from 'react-use';

import { loadBackendJson } from '../backendShared';
import { BilibiliAuthStatus, BilibiliQrLoginResult } from '../chatView/types';

const QR_POLL_INTERVAL_MS = 1200;

interface PanelMessage {
  type: 'success' | 'error' | 'info';
  text: string;
}

interface BilibiliAuthPanelProps {
  onCookieSaved?: () => Promise<void> | void;
}

interface BilibiliAuthPanelState {
  status: BilibiliAuthStatus | null;
  loadingStatus: boolean;
  startingLogin: boolean;
  sessionId: string;
  qrUrl: string;
  qrState: 'idle' | NonNullable<BilibiliQrLoginResult['state']>;
  panelMessage: PanelMessage | null;
}

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

const getStatusBadge = (status: BilibiliAuthStatus | null) => {
  switch (status?.state) {
    case 'authenticated':
      return {
        icon: ShieldCheck,
        label: 'Logged In',
        className: `
          border border-emerald-200 bg-emerald-50 text-emerald-700

          dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200
        `,
      };
    case 'logged_out':
      return {
        icon: ShieldAlert,
        label: 'Needs Refresh',
        className: `
          border border-amber-200 bg-amber-50 text-amber-700

          dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200
        `,
      };
    case 'configured':
      return {
        icon: ShieldCheck,
        label: 'Stored Locally',
        className: `
          border border-sky-200 bg-sky-50 text-sky-700

          dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200
        `,
      };
    default:
      return {
        icon: ShieldAlert,
        label: 'Not Configured',
        className: `
          border border-zinc-200 bg-zinc-100 text-zinc-700

          dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200
        `,
      };
  }
};

const getStatusDescription = (status: BilibiliAuthStatus | null) => {
  if (!status?.configured) {
    return 'No Bilibili cookie is stored in the active settings profile yet.';
  }

  if (status.state === 'authenticated') {
    if (status.username && status.userId) {
      return `Signed in as ${status.username} (${status.userId}).`;
    }
    if (status.username) {
      return `Signed in as ${status.username}.`;
    }
    if (status.userId) {
      return `Signed in with Bilibili user ${status.userId}.`;
    }
    return 'The stored Bilibili cookie is currently authenticated.';
  }

  if (status.state === 'logged_out') {
    return 'A cookie is stored locally, but Bilibili reported that the session is no longer logged in.';
  }

  if (status.remoteError) {
    return 'A cookie is stored locally, but CyberCat could not verify it with Bilibili right now.';
  }

  return 'A Bilibili cookie is stored locally in CyberCat settings.';
};

export const BilibiliAuthPanel = ({ onCookieSaved }: BilibiliAuthPanelProps) => {
  const [state, setState] = useSetState<BilibiliAuthPanelState>({
    status: null,
    loadingStatus: false,
    startingLogin: false,
    sessionId: '',
    qrUrl: '',
    qrState: 'idle',
    panelMessage: null,
  });
  const { status, loadingStatus, startingLogin, sessionId, qrUrl, qrState, panelMessage } = state;

  const refreshStatus = async (silent = false) => {
    if (!window.backend?.get_bilibili_auth_status) {
      if (!silent) {
        setState({
          panelMessage: {
            type: 'error',
            text: 'Bilibili login controls are not available in this runtime.',
          },
        });
      }
      return;
    }

    if (!silent) {
      setState({ loadingStatus: true });
    }

    try {
      const nextStatus = await loadBackendJson<BilibiliAuthStatus>(
        () => window.backend?.get_bilibili_auth_status?.(),
        'Bilibili auth status',
      );
      setState({ status: nextStatus });
    } catch (error: unknown) {
      if (!silent) {
        const message = error instanceof Error ? error.message : 'Failed to refresh Bilibili status.';
        setState({ panelMessage: { type: 'error', text: message } });
      }
    } finally {
      if (!silent) {
        setState({ loadingStatus: false });
      }
    }
  };

  useMount(() => {
    void refreshStatus();
  });

  useEffect(() => {
    if (!sessionId || !window.backend?.poll_bilibili_qr_login) {
      return undefined;
    }

    let cancelled = false;
    let polling = false;

    const pollQrLogin = async () => {
      if (polling) {
        return;
      }

      polling = true;
      try {
        const result = await loadBackendJson<BilibiliQrLoginResult>(
          () => window.backend?.poll_bilibili_qr_login?.(sessionId),
          'Poll Bilibili QR login',
        );
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setState({
            sessionId: '',
            qrUrl: '',
            qrState: 'idle',
            panelMessage: {
              type: 'error',
              text: result.error || 'Failed to poll Bilibili QR login.',
            },
          });
          return;
        }

        if (result.status) {
          setState({ status: result.status });
        }

        if (result.state === 'waiting_confirm') {
          setState({
            qrState: 'waiting_confirm',
            panelMessage: {
              type: 'info',
              text: 'QR scanned. Confirm the login in the Bilibili app.',
            },
          });
          return;
        }

        if (result.state === 'waiting_scan') {
          setState({ qrState: 'waiting_scan' });
          return;
        }

        if (result.state === 'expired') {
          setState({
            sessionId: '',
            qrUrl: '',
            qrState: 'expired',
            panelMessage: {
              type: 'error',
              text: 'This QR code expired. Start a new Bilibili login session.',
            },
          });
          return;
        }

        if (result.state === 'success') {
          setState((currentState) => ({
            sessionId: '',
            qrUrl: '',
            qrState: 'success',
            status: result.status || currentState.status,
            panelMessage: {
              type: 'success',
              text: 'Bilibili login saved to the active local settings profile.',
            },
          }));
          await Promise.resolve(onCookieSaved?.());
          if (!result.status) {
            await refreshStatus(true);
          }
        }
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Failed to poll Bilibili QR login.';
        setState({
          sessionId: '',
          qrUrl: '',
          qrState: 'idle',
          panelMessage: { type: 'error', text: message },
        });
      } finally {
        polling = false;
      }
    };

    void pollQrLogin();
    const intervalId = window.setInterval(() => {
      void pollQrLogin();
    }, QR_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [onCookieSaved, sessionId, setState]);

  const startQrLogin = async () => {
    if (!window.backend?.start_bilibili_qr_login) {
      setState({
        panelMessage: {
          type: 'error',
          text: 'Bilibili QR login is not available in this runtime.',
        },
      });
      return;
    }

    setState({
      startingLogin: true,
      panelMessage: null,
      qrState: 'idle',
    });

    try {
      const result = await loadBackendJson<BilibiliQrLoginResult>(
        () => window.backend?.start_bilibili_qr_login?.(),
        'Start Bilibili QR login',
      );
      if (!result.ok || !result.sessionId || !result.qrUrl) {
        throw new Error(result.error || 'Bilibili QR login did not return a valid QR code.');
      }

      setState({
        sessionId: result.sessionId,
        qrUrl: result.qrUrl,
        qrState: result.state || 'waiting_scan',
        panelMessage: {
          type: 'info',
          text: 'Scan the QR code with the Bilibili app to sign in.',
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to start Bilibili QR login.';
      setState({
        sessionId: '',
        qrUrl: '',
        qrState: 'idle',
        panelMessage: { type: 'error', text: message },
      });
    } finally {
      setState({ startingLogin: false });
    }
  };

  const statusBadge = getStatusBadge(status);
  const StatusIcon = statusBadge.icon;
  const qrDescription =
    qrState === 'waiting_confirm'
      ? 'QR scanned. Approve the login on your phone to finish.'
      : 'Open Bilibili on your phone and scan this code.';

  return (
    <div className="cybercat-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="
          text-sm font-semibold text-zinc-900

          dark:text-zinc-100
        ">
          QR Login
        </h3>

        <div className={`
          inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-xs font-medium

          ${statusBadge.className}
        `}>
          <StatusIcon size={12} />
          <span>{statusBadge.label}</span>
        </div>
      </div>

      {(panelMessage || status?.remoteError) && (
        <div className="mb-4">
          {status?.remoteError && !panelMessage && (
            <Alert type="warning" message={status.remoteError} showIcon />
          )}
          {panelMessage && (
            <Alert type={panelMessage.type} message={panelMessage.text} showIcon />
          )}
        </div>
      )}

      <div className="flex items-start gap-5">
        <div className="
          flex shrink-0 flex-col items-center justify-center rounded-xl border border-dashed
          border-zinc-200 bg-zinc-50/70 p-3

          dark:border-white/10 dark:bg-zinc-900/70
        ">
          {qrUrl ? (
            <QRCode value={qrUrl} size={300} />
          ) : (
            <div className="
              flex size-[316px] items-center justify-center text-zinc-300

              dark:text-zinc-600
            ">
              <QrCode size={32} />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="
            text-xs text-zinc-500

            dark:text-zinc-400
          ">
            {qrUrl
              ? qrDescription
              : getStatusDescription(status)}
            {status?.expiresAt ? ` Expires ${formatTimestamp(status.expiresAt)}.` : ''}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              size="middle"
              loading={startingLogin}
              icon={<ScanQrCode size={14} />}
              onClick={startQrLogin}
            >
              {qrUrl ? 'Restart' : 'Start QR Login'}
            </Button>

            <Button
              size="middle"
              icon={<RefreshCw size={14} />}
              loading={loadingStatus}
              onClick={() => {
                void refreshStatus();
              }}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};