import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emptyCursor,
  evaluate,
  mergeNotifications,
  toastLifetime,
  type NotifyCursor,
  type NotifyInput,
  type NotifyKind,
  type RoomNotification,
} from './notifications.js';
import {
  channelsFor,
  lastReadAt,
  loadSettings,
  markRoomRead,
  permission,
  playAlert,
  registerNotifyWorker,
  requestPermission,
  saveSettings,
  showDeviceNotification,
  type NotifySettings,
  type Permission,
} from './notifyChannels.js';

/** A glance is not an inbox: four banners at once is already too many. */
const MAX_TOASTS = 4;
const CHANNELS = ['toast', 'device'] as const;

export interface NotificationCenter {
  notifications: RoomNotification[];
  toasts: RoomNotification[];
  /** Lifted so a banner can open the panel, not only the bell. */
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  unread: number;
  settings: NotifySettings;
  permission: Permission;
  snoozedFor: number;
  /** Fed by the poll loop after every beat. Safe to call with nothing new. */
  ingest: (input: NotifyInput) => void;
  markRead: () => void;
  clearAll: () => void;
  dismissToast: (id: string) => void;
  setChannel: (kind: NotifyKind, channel: (typeof CHANNELS)[number], on: boolean) => void;
  setSound: (on: boolean) => void;
  snooze: (minutes: number) => void;
  askPermission: () => Promise<Permission>;
}

/**
 * Turns the dashboard's existing 2s poll into notifications. The hook owns the diff cursor (a ref,
 * because it must never re-render anything), the collected list, the banner queue and the settings.
 */
export function useNotificationCenter(roomCode: string, clientId = ''): NotificationCenter {
  const [settings, setSettings] = useState<NotifySettings>(loadSettings);
  const [notifications, setNotifications] = useState<RoomNotification[]>([]);
  const [toasts, setToasts] = useState<RoomNotification[]>([]);
  const [permissionState, setPermissionState] = useState<Permission>(() => permission());
  const [readAt, setReadAt] = useState(() => lastReadAt(roomCode));
  const [panelOpen, setPanelOpen] = useState(false);

  const cursor = useRef<NotifyCursor>(emptyCursor());
  // ingest() must stay identity-stable so it can be called from inside the poll effect without
  // re-creating that effect on every settings change.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const roomRef = useRef(roomCode);
  roomRef.current = roomCode;

  // A new room (or a new handle in it) means a new baseline: no leftovers, and no alerts about the
  // room's past. Re-priming on a handle change keeps the roster diff honest about who is "me".
  useEffect(() => {
    cursor.current = emptyCursor();
    setNotifications([]);
    setToasts([]);
    setReadAt(lastReadAt(roomCode));
  }, [roomCode, clientId]);

  useEffect(() => {
    void registerNotifyWorker();
  }, []);

  // The decision can change outside this page - the site-settings toggle, or the prompt itself -
  // and a settings panel showing a permission the browser no longer has is worse than not showing
  // one. Re-read it on mount, when the panel opens, and when the tab comes back to life.
  useEffect(() => {
    const sync = () => setPermissionState(permission());
    sync();
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, [panelOpen]);

  // A snooze must end on its own. Nothing else re-renders this hook in an idle tab, and a bell still
  // crossed out after the window passed would be a lie - so wake up exactly when it expires.
  const [, wakeSnooze] = useState(0);
  useEffect(() => {
    const left = settings.snoozeUntil - Date.now();
    if (left <= 0) return undefined;
    // Clamped: a hand-edited expiry beyond the 24-day setTimeout ceiling must not schedule instantly.
    const timer = setTimeout(() => wakeSnooze((value) => value + 1), Math.min(left, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [settings.snoozeUntil]);

  const ingest = useCallback((input: NotifyInput) => {
    const result = evaluate(input, cursor.current);
    cursor.current = result.cursor;
    if (!result.events.length) return;

    const stamped: RoomNotification[] = result.events.map((event) => ({
      ...event,
      expiresAt: input.now + toastLifetime(event.severity),
    }));
    setNotifications((previous) => mergeNotifications(previous, stamped));

    const live = settingsRef.current;
    const banners: RoomNotification[] = [];
    for (const event of stamped) {
      const channels = channelsFor(event, live);
      if (channels.device) void showDeviceNotification(event);
      if (!channels.toast) continue;
      banners.push(event);
      if (live.sound && event.severity === 'high') playAlert();
    }
    if (banners.length) setToasts((previous) => [...banners, ...previous].slice(0, MAX_TOASTS));
  }, []);

  // One interval while banners are up is cheaper and steadier than a timer per toast.
  const hasToasts = toasts.length > 0;
  useEffect(() => {
    if (!hasToasts) return;
    const prune = () =>
      setToasts((previous) => {
        const next = previous.filter((t) => (t.expiresAt ?? 0) > Date.now());
        return next.length === previous.length ? previous : next;
      });
    prune();
    const timer = setInterval(prune, 1000);
    return () => clearInterval(timer);
  }, [hasToasts]);

  const update = useCallback((mutate: (current: NotifySettings) => NotifySettings) => {
    setSettings((current) => {
      const next = mutate(current);
      saveSettings(next);
      return next;
    });
  }, []);

  // Stable identities, because the poll loop and the panel's effects both depend on them: an inline
  // arrow here would re-run those effects on every render.
  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const markRead = useCallback(() => setReadAt(markRoomRead(roomRef.current)), []);
  const dismissToast = useCallback((id: string) => setToasts((previous) => previous.filter((t) => t.id !== id)), []);
  const clearAll = useCallback(() => {
    setNotifications([]);
    setToasts([]);
    markRead();
  }, [markRead]);
  const setChannel = useCallback(
    (kind: NotifyKind, channel: (typeof CHANNELS)[number], on: boolean) =>
      update((current) => ({
        ...current,
        kinds: { ...current.kinds, [kind]: { ...current.kinds[kind], [channel]: on } },
      })),
    [update],
  );
  const setSound = useCallback((on: boolean) => update((current) => ({ ...current, sound: on })), [update]);
  const snooze = useCallback(
    (minutes: number) =>
      update((current) => ({ ...current, snoozeUntil: minutes > 0 ? Date.now() + minutes * 60_000 : 0 })),
    [update],
  );
  const askPermission = useCallback(async () => {
    const next = await requestPermission();
    setPermissionState(next);
    return next;
  }, []);

  const unread = readAt
    ? notifications.filter((n) => n.at > readAt).length
    : notifications.length;
  const snoozedFor = Math.max(0, settings.snoozeUntil - Date.now());

  return {
    notifications,
    toasts,
    panelOpen,
    openPanel,
    closePanel,
    unread,
    settings,
    permission: permissionState,
    snoozedFor,
    ingest,
    markRead,
    clearAll,
    dismissToast,
    setChannel,
    setSound,
    snooze,
    askPermission,
  };
}
