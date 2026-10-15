import {
  NOTIFIABLE_KINDS,
  defaultPrefs,
  kindInfo,
  type NotifyPrefs,
  type RoomNotification,
  type NotifyKind,
} from './notifications.js';

/**
 * Everything here touches a browser API, so every entry point degrades quietly: a denied
 * permission, a missing Notification constructor, an AudioContext that refuses to start, or a
 * localStorage in Safari private mode must never break the room.
 */

const SETTINGS_KEY = 'cowork-notify-settings-v1';
const READ_KEY = 'cowork-notify-read-v1';
export const SW_PATH = '/sw-notifications.js';

export interface NotifySettings {
  kinds: NotifyPrefs;
  /** Short in-page chime for high-severity events. Off by default: sound in a shared room is rude. */
  sound: boolean;
  /** Epoch ms until which no banner or device alert fires. The centre still collects them. */
  snoozeUntil: number;
}

export const defaultSettings = (): NotifySettings => ({
  kinds: defaultPrefs(),
  sound: false,
  snoozeUntil: 0,
});

const safeStorage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // throws outright when cookies/storage are blocked
  }
};

const saneFlags = (value: unknown, fallback: { toast: boolean; device: boolean }) => {
  if (!value || typeof value !== 'object') return { ...fallback };
  const raw = value as Record<string, unknown>;
  return {
    toast: typeof raw.toast === 'boolean' ? raw.toast : fallback.toast,
    device: typeof raw.device === 'boolean' ? raw.device : fallback.device,
  };
};

export function loadSettings(): NotifySettings {
  const base = defaultSettings();
  const store = safeStorage();
  if (!store) return base;
  try {
    const parsed = JSON.parse(store.getItem(SETTINGS_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return base;
    const raw = parsed as Record<string, unknown>;
    const kinds = defaultPrefs();
    const storedKinds = (raw.kinds ?? {}) as Record<string, unknown>;
    for (const kind of NOTIFIABLE_KINDS) {
      const info = kindInfo(kind);
      kinds[kind] = saneFlags(storedKinds[kind], { toast: info.toast, device: info.device });
    }
    return {
      kinds,
      sound: raw.sound === true,
      snoozeUntil: typeof raw.snoozeUntil === 'number' && raw.snoozeUntil > Date.now() ? raw.snoozeUntil : 0,
    };
  } catch {
    return base; // a corrupt entry is not worth losing the session over
  }
}

/** Writes are best-effort: a full, blocked or private-mode storage must never break the room. */
function write(key: string, value: string): void {
  try {
    safeStorage()?.setItem(key, value);
  } catch {
    /* quota or SecurityError - the settings simply do not persist */
  }
}

export function saveSettings(settings: NotifySettings): void {
  write(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Read state is per room: opening the panel in one room must not mark another room's alerts as seen,
 * and it survives a reload so a refresh never re-badges old news.
 */
export function readMarks(): Record<string, number> {
  const store = safeStorage();
  if (!store) return {};
  try {
    const parsed = JSON.parse(store.getItem(READ_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    // Numbers only: a hand-edited or half-written entry must not make every alert read as unseen.
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function lastReadAt(roomCode: string): number {
  if (!roomCode) return 0;
  return readMarks()[roomCode.toUpperCase()] ?? 0;
}

export function markRoomRead(roomCode: string, at = Date.now()): number {
  const room = (roomCode || '').toUpperCase();
  if (!room) return at;
  const marks = readMarks();
  marks[room] = at;
  write(READ_KEY, JSON.stringify(marks));
  return at;
}

export function isSnoozed(settings: NotifySettings, now = Date.now()): boolean {
  return settings.snoozeUntil > now;
}

export type Permission = 'unsupported' | 'default' | 'granted' | 'denied';

const hasNotifications = (): boolean => typeof Notification !== 'undefined' && 'permission' in Notification;

export function permission(): Permission {
  if (!hasNotifications()) return 'unsupported';
  return Notification.permission as Permission;
}

/** Why the button would not help, phrased for the one browser where it is not a simple yes/no. */
export function permissionHint(perm: Permission = permission()): string {
  if (perm === 'granted') return 'Device alerts are on. The dashboard can only fire them while it is open.';
  if (perm === 'denied') {
    return 'Blocked by the browser. Re-enable notifications for this site in its site settings, then reload.';
  }
  if (perm === 'unsupported') {
    return 'This browser has no notification API. On iPhone/iPad, add CoWork to the Home Screen first - notifications only reach installed web apps there.';
  }
  return 'Your browser will ask once. Alerts only arrive while this tab is alive: CoWork has no server push yet.';
}

export async function requestPermission(timeoutMs = 8_000): Promise<Permission> {
  if (!hasNotifications()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  const settleNow = (): Permission => Notification.permission as Permission;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Two shapes to satisfy: the promise form everywhere modern, and Safari's callback form, which
    // returns undefined. A browser that never answers at all must not leave the settings panel
    // waiting, so a timeout settles it with whatever the platform currently says.
    const pending = new Promise<Permission>((resolve) => {
      let settled = false;
      const done = (value: NotificationPermission) => {
        if (settled) return;
        settled = true;
        resolve(((value ?? Notification.permission) as unknown) as Permission);
      };
      const maybe = Notification.requestPermission(done);
      if (maybe && typeof (maybe as Promise<NotificationPermission>).then === 'function') {
        (maybe as Promise<NotificationPermission>).then(done, () => done(Notification.permission));
      }
    });
    const guard = new Promise<Permission>((resolve) => {
      timer = setTimeout(() => resolve(settleNow()), timeoutMs);
    });
    return await Promise.race([pending, guard]);
  } catch {
    return settleNow();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The worker exists for one reason: `showNotification` on a registration, which is the only path
 * Android Chrome honours. It has no fetch handler, so it cannot cache or intercept the app.
 */
export async function registerNotifyWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register(SW_PATH, { scope: '/', updateViaCache: 'none' });
  } catch {
    // File blocked, insecure origin, or SW disabled: banners still work, just not on Android.
  }
}

/*
 * A cold click can only land on the app shell: a notification carries no room code, so there is
 * nothing to deep-link into, and opening the join screen at a guess would be worse than opening it
 * plainly. Focusing the *message* is the live-tab path, via the postMessage below.
 */
const clickTarget = (): string => '/';

/** Returns whether an OS-level notification was actually shown. */
export async function showDeviceNotification(n: RoomNotification): Promise<boolean> {
  if (permission() !== 'granted') return false;
  const options: NotificationOptions = {
    body: n.body,
    tag: n.id, // same id twice replaces instead of stacking
    silent: n.severity === 'quiet',
    requireInteraction: n.severity === 'high',
    data: { kind: n.kind, actor: n.actor, messageId: n.messageId, url: clickTarget() },
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration?.showNotification) {
      await registration.showNotification(n.title, options);
      return true;
    }
    if (typeof Notification === 'undefined') return false;
    new Notification(n.title, options);
    return true;
  } catch {
    return false;
  }
}

let audio: AudioContext | null = null;

/** Two short tones. Created lazily because browsers only allow it after a user gesture. */
export function playAlert(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio = audio ?? new Ctor();
    if (audio.state === 'suspended') void audio.resume();
    const ctx = audio;
    const start = ctx.currentTime;
    [660, 880].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const from = start + index * 0.12;
      gain.gain.setValueAtTime(0.0001, from);
      gain.gain.exponentialRampToValueAtTime(0.06, from + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, from + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(from);
      osc.stop(from + 0.13);
    });
  } catch {
    // Autoplay policy or no audio device: the banner is the delivery that matters.
  }
}

/** Which channels an event should use, given the stored settings. */
export function channelsFor(n: RoomNotification, settings: NotifySettings): { toast: boolean; device: boolean } {
  const flags = settings.kinds[n.kind as NotifyKind] ?? defaultPrefs()[n.kind as NotifyKind];
  if (!flags || isSnoozed(settings)) return { toast: false, device: false };
  // The device half needs more than a switch: no permission, no banner from the OS.
  return { toast: flags.toast, device: permission() === 'granted' && flags.device };
}
