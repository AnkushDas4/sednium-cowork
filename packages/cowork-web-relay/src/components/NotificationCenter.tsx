import React, { useEffect, useState } from 'react';
import {
  AtSign,
  Bell,
  BellOff,
  CheckCheck,
  CircleAlert,
  GitCommit,
  Info,
  MessageSquare,
  MessageSquareText,
  Radio,
  SlidersHorizontal,
  Timer,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { NOTIFY_KINDS, timeAgo, type NotifyKind, type RoomNotification } from '../notifications.js';
import { permissionHint } from '../notifyChannels.js';
import type { NotificationCenter as Model } from '../useNotificationCenter.js';

const ICON: Record<NotifyKind, typeof AtSign> = {
  mention: AtSign,
  prompt: MessageSquareText,
  dm: MessageSquare,
  push: GitCommit,
  attention: CircleAlert,
  done: CheckCheck,
  joined: Users,
  left: Radio,
};

const TONE: Record<NotifyKind, string> = {
  mention: 'text-accent bg-accent-soft',
  prompt: 'text-accent bg-accent-soft',
  dm: 'text-secondary bg-hover',
  push: 'text-secondary bg-hover',
  attention: 'text-danger bg-danger-soft',
  done: 'text-ok bg-ok-soft',
  joined: 'text-muted bg-hover',
  left: 'text-warn bg-warn-soft',
};

const Switch: React.FC<{
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  disabledHint?: string;
}> = ({ on, onChange, label, disabled, disabledHint }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    title={disabled ? disabledHint : label}
    disabled={disabled}
    onClick={() => onChange(!on)}
    className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
      on ? 'bg-accent border-accent' : 'bg-hover border-grid'
    } ${disabled ? 'opacity-40' : 'hover:border-accent/50'} disabled:cursor-not-allowed`}
  >
    <span
      className={`absolute top-[3px] h-4 w-4 rounded-full transition-all ${
        on ? 'left-[25px] bg-accent-ink' : 'left-[3px] bg-muted'
      }`}
    />
  </button>
);

const snoozeOptions = [
  { label: '15m', minutes: 15 },
  { label: '1h', minutes: 60 },
  { label: '4h', minutes: 240 },
];

interface Props {
  center: Model;
}

/**
 * The bell, its panel and its settings. The panel is the only durable view of alerts: toasts expire,
 * this list survives until the tab reloads, because the relay stores notifications nowhere on purpose
 * (they are derived from state that is already on the wire).
 */
export const NotificationCenter: React.FC<Props> = ({ center }) => {
  const { openPanel, closePanel, markRead, panelOpen: open } = center;
  const [tab, setTab] = useState<'alerts' | 'settings'>('alerts');
  // Relative times only need to move while somebody is actually looking.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    markRead();
    const timer = setInterval(() => setTick((v) => v + 1), 15_000);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, markRead, closePanel]);

  const badge = center.unread > 9 ? '9+' : String(center.unread);
  const quiet = center.snoozedFor > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          quiet
            ? `Notifications snoozed for ${Math.ceil(center.snoozedFor / 60000)} min`
            : `Notifications${center.unread ? `, ${center.unread} unread` : ''}`
        }
        title={quiet ? `Alerts snoozed for ${Math.ceil(center.snoozedFor / 60000)} min - click to end it` : 'Notifications'}
        data-id="notification-bell"
        className={`relative min-tap p-2 flex items-center justify-center rounded-sm transition-colors border ${
          open ? 'bg-hover border-grid text-primary' : 'border-transparent text-secondary hover:text-primary hover:bg-hover'
        }`}
      >
        {quiet ? <BellOff className="w-4 h-4 text-muted" /> : <Bell className="w-4 h-4 text-accent" />}
        {center.unread > 0 && (
          <span className="absolute -top-0.5 right-0 min-w-[15px] h-[15px] px-0.5 rounded-full bg-accent text-accent-ink text-[9px] font-bold leading-[15px] text-center font-mono">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default"
            onClick={closePanel}
          />
          <div
            role="dialog"
            aria-label="Room notifications"
            data-id="notification-panel"
            className="fixed z-50 inset-x-2 top-14 xs:inset-x-auto xs:right-3 xs:top-14 xs:w-[22rem] sm:top-16 rounded-lg border border-grid bg-panel shadow-float overflow-hidden"
          >
            <div className="flex items-stretch divide-x divide-grid border-b border-grid bg-panel select-none">
              <button
                type="button"
                onClick={() => setTab('alerts')}
                aria-pressed={tab === 'alerts'}
                className={`min-tap flex-1 flex items-center justify-center gap-1.5 text-2xs font-sans font-semibold uppercase tracking-wider transition-colors ${
                  tab === 'alerts' ? 'text-primary bg-canvas' : 'text-muted hover:text-secondary'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                Alerts
                <span className="font-mono text-muted">({center.notifications.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('settings')}
                aria-pressed={tab === 'settings'}
                className={`min-tap w-24 flex items-center justify-center gap-1.5 text-2xs font-sans font-semibold uppercase tracking-wider transition-colors ${
                  tab === 'settings' ? 'text-primary bg-canvas' : 'text-muted hover:text-secondary'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Settings
              </button>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Close"
                className="min-tap w-11 flex items-center justify-center text-muted hover:text-primary hover:bg-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {quiet && (
              <div className="flex items-center gap-2 border-b border-grid bg-warn-soft px-3 py-1.5 text-2xs font-sans text-warn">
                <Timer className="w-3.5 h-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  Snoozed for {Math.ceil(center.snoozedFor / 60000)} min - alerts are collected, not shown
                </span>
                <button
                  type="button"
                  onClick={() => center.snooze(0)}
                  className="shrink-0 rounded-sm border border-warn/40 px-1.5 py-0.5 font-semibold uppercase tracking-wider hover:bg-warn/10"
                >
                  End
                </button>
              </div>
            )}

            {tab === 'alerts' ? (
              <>
                {center.notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <CheckCheck className="w-5 h-5 text-muted mx-auto mb-2" />
                    <p className="text-xs font-sans text-secondary">Nothing needs you.</p>
                    <p className="mt-1 text-2xs font-sans text-muted">
                      Mentions, finished agents and stuck agents land here as the room moves.
                    </p>
                  </div>
                ) : (
                  <ul className="max-h-[52dvh] overflow-y-auto scroll-panel divide-y divide-grid">
                    {center.notifications.map((n: RoomNotification) => {
                      const Icon = ICON[n.kind] ?? Info;
                      return (
                        <li key={n.id} className="flex items-start gap-2.5 px-3 py-2.5">
                          <span className={`mt-0.5 inline-flex w-6 h-6 shrink-0 items-center justify-center rounded-sm ${TONE[n.kind]}`}>
                            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="truncate text-xs font-sans font-semibold text-primary">{n.title}</span>
                              <span className="ml-auto shrink-0 text-2xs font-mono text-muted">{timeAgo(Date.now() - n.at)}</span>
                            </div>
                            {n.body && <p className="mt-0.5 break-words text-2xs font-sans text-secondary leading-snug">{n.body}</p>}
                            {n.files && n.files.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {n.files.slice(0, 4).map((f) => (
                                  <span key={f} title={f} className="max-w-[12rem] truncate rounded-sm border border-grid bg-canvas px-1 py-0.5 font-mono text-[9px] text-muted">
                                    {f}
                                  </span>
                                ))}
                                {n.files.length > 4 && <span className="font-mono text-[9px] text-muted">+{n.files.length - 4}</span>}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex items-stretch divide-x divide-grid border-t border-grid">
                  <button
                    type="button"
                    onClick={markRead}
                    className="min-tap flex-1 flex items-center justify-center gap-1.5 text-2xs font-sans font-semibold uppercase tracking-wider text-muted hover:text-primary hover:bg-hover transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Mark read
                  </button>
                  <button
                    type="button"
                    onClick={center.clearAll}
                    className="min-tap flex-1 flex items-center justify-center gap-1.5 text-2xs font-sans font-semibold uppercase tracking-wider text-muted hover:text-primary hover:bg-hover transition-colors"
                  >
                    Clear list
                  </button>
                </div>
              </>
            ) : (
              <div className="max-h-[62dvh] overflow-y-auto scroll-panel">
                <div className="border-b border-grid px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="text-2xs font-sans font-semibold uppercase tracking-wider text-secondary">
                      Device alerts
                    </span>
                    <span className="ml-auto text-2xs font-mono text-muted">{center.permission}</span>
                    {center.permission === 'default' && (
                      <button
                        type="button"
                        onClick={() => void center.askPermission()}
                        className="rounded-sm bg-accent px-2 py-1 text-2xs font-sans font-semibold uppercase tracking-wider text-accent-ink hover:bg-accent-strong transition-colors"
                      >
                        Enable
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 flex items-start gap-1.5 text-2xs font-sans text-muted leading-snug">
                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{permissionHint(center.permission)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2.5 border-b border-grid px-3 py-2.5">
                  {center.settings.sound ? (
                    <Volume2 className="w-3.5 h-3.5 text-accent shrink-0" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 text-muted shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-sans font-medium text-primary">Chime on urgent alerts</span>
                    <span className="block text-2xs text-muted">Two short tones, only while this tab is open</span>
                  </div>
                  <Switch on={center.settings.sound} onChange={center.setSound} label="Chime on urgent alerts" />
                </div>

                <div className="flex items-center gap-2.5 border-b border-grid px-3 py-2.5">
                  <Timer className="w-3.5 h-3.5 text-muted shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-sans font-medium text-primary">Snooze</span>
                    <span className="block text-2xs text-muted">Keeps banners and device alerts quiet; the list still fills</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {snoozeOptions.map((option) => (
                      <button
                        key={option.minutes}
                        type="button"
                        onClick={() => center.snooze(option.minutes)}
                        className="rounded-sm border border-grid bg-canvas px-1.5 py-1 text-2xs font-mono text-secondary hover:border-accent/40 hover:text-accent transition-colors"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <ul className="divide-y divide-grid">
                  {NOTIFY_KINDS.map((info) => {
                    const flags = center.settings.kinds[info.kind];
                    return (
                      <li key={info.kind} className="px-3 py-2.5">
                        <div className="flex items-start gap-2.5">
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-sans font-medium text-primary">{info.label}</span>
                            <span className="mt-0.5 block text-2xs font-sans text-muted leading-snug">{info.hint}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-3 pt-0.5">
                            <label className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-sans uppercase tracking-wider text-muted">Banner</span>
                              <Switch
                                on={flags.toast}
                                onChange={(next) => center.setChannel(info.kind, 'toast', next)}
                                label={`${info.label}: in-room banner`}
                              />
                            </label>
                            <label className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-sans uppercase tracking-wider text-muted">Device</span>
                              <Switch
                                on={flags.device}
                                disabled={center.permission !== 'granted'}
                                disabledHint="Enable device alerts above first"
                                onChange={(next) => center.setChannel(info.kind, 'device', next)}
                                label={`${info.label}: system notification`}
                              />
                            </label>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
};

