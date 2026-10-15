import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  channelsFor,
  defaultSettings,
  isSnoozed,
  lastReadAt,
  loadSettings,
  markRoomRead,
  permissionHint,
  playAlert,
  registerNotifyWorker,
  requestPermission,
  saveSettings,
  showDeviceNotification,
  SW_PATH,
} from '../src/notifyChannels.js';
import type { RoomNotification } from '../src/notifications.js';

/** A localStorage that behaves like one, without a DOM. */
const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
};

const note = (over: Partial<RoomNotification> = {}): RoomNotification => ({
  id: 'n1',
  kind: 'mention',
  severity: 'high',
  title: '@gem-ai mentioned you',
  body: 'can you review this?',
  at: Date.now(),
  messageId: 'm1',
  ...over,
});

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Notification settings storage', () => {
  it('starts from the documented defaults', () => {
    const settings = loadSettings();
    expect(settings).toEqual(defaultSettings());
    expect(settings.kinds.mention).toEqual({ toast: true, device: true });
    expect(settings.kinds.joined).toEqual({ toast: false, device: false });
    expect(settings.sound).toBe(false);
    expect(settings.snoozeUntil).toBe(0);
  });

  it('survives a corrupt or hostile entry', () => {
    storage.setItem('cowork-notify-settings-v1', '{not json');
    expect(loadSettings()).toEqual(defaultSettings());
    storage.setItem('cowork-notify-settings-v1', 'null');
    expect(loadSettings()).toEqual(defaultSettings());
    storage.setItem(
      'cowork-notify-settings-v1',
      JSON.stringify({ kinds: { mention: { toast: 'yes', device: 1 }, nonsense: 1 }, sound: 'on', snoozeUntil: 5 }),
    );
    const loaded = loadSettings();
    expect(loaded.kinds.mention).toEqual({ toast: true, device: true }); // junk falls back, it does not mute
    expect(loaded.sound).toBe(false);
    expect(loaded.snoozeUntil).toBe(0); // an expired snooze is not honoured
    expect((loaded.kinds as Record<string, unknown>).nonsense).toBeUndefined();
  });

  it('keeps a real future snooze across a reload', () => {
    const until = Date.now() + 600_000;
    saveSettings({ ...defaultSettings(), snoozeUntil: until, sound: true, kinds: { ...defaultSettings().kinds, push: { toast: false, device: false } } });
    const reloaded = loadSettings();
    expect(reloaded.snoozeUntil).toBe(until);
    expect(reloaded.sound).toBe(true);
    expect(reloaded.kinds.push).toEqual({ toast: false, device: false });
    expect(isSnoozed(reloaded)).toBe(true);
    expect(isSnoozed(reloaded, until + 1)).toBe(false);
  });

  it('tracks read state per room, so one room cannot clear another', () => {
    expect(lastReadAt('ROOM-A')).toBe(0);
    markRoomRead('room-a', 1000);
    expect(lastReadAt('ROOM-A')).toBe(1000);
    expect(lastReadAt('ROOM-B')).toBe(0);
    markRoomRead('', 2000); // no room, no write
    expect(lastReadAt('ROOM-A')).toBe(1000);
  });

  it('does not fall over when storage itself throws', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('SecurityError: storage disabled');
      },
      setItem() {
        throw new Error('SecurityError');
      },
    });
    expect(loadSettings()).toEqual(defaultSettings());
    expect(() => saveSettings(defaultSettings())).not.toThrow();
    expect(() => markRoomRead('ROOM-A')).not.toThrow();
  });
});

describe('Channel selection', () => {
  it('mutes everything while snoozed, and needs permission for the device', () => {
    const settings = defaultSettings();
    expect(channelsFor(note(), settings)).toEqual({ toast: true, device: false }); // not granted here
    expect(channelsFor(note(), { ...settings, snoozeUntil: Date.now() + 60_000 })).toEqual({ toast: false, device: false });

    const off = { ...settings, kinds: { ...settings.kinds, mention: { toast: false, device: false } } };
    expect(channelsFor(note(), off)).toEqual({ toast: false, device: false });
    expect(channelsFor(note({ kind: 'joined' }), settings).toast).toBe(false);
  });
});

describe('Device alerts', () => {
  const grantedNotification = (permission: string) => {
    const created: Array<{ title: string; options: NotificationOptions }> = [];
    class FakeNotification {
      static permission = permission;
      static requestPermission = vi.fn(async () => permission);
      constructor(public title: string, public options: NotificationOptions) {
        created.push({ title, options });
      }
    }
    vi.stubGlobal('Notification', FakeNotification);
    return created;
  };

  it('says so plainly when the browser has no notification API', async () => {
    expect(await showDeviceNotification(note())).toBe(false);
    expect(permissionHint('unsupported')).toMatch(/Home Screen/);
    expect(permissionHint('denied')).toMatch(/site settings/i);
    expect(permissionHint('granted')).toMatch(/while it is open/);
    expect(permissionHint('default')).toMatch(/will ask once/);
  });

  it('uses the page-level constructor when there is no worker, and never throws', async () => {
    const created = grantedNotification('granted');
    vi.stubGlobal('navigator', {});
    await expect(showDeviceNotification(note())).resolves.toBe(true);
    expect(created[0].title).toBe('@gem-ai mentioned you');
    // high severity holds on screen; the id is the tag so a redelivery replaces instead of stacking
    expect(created[0].options).toMatchObject({ tag: 'n1', requireInteraction: true });
    await expect(showDeviceNotification(note({ severity: 'quiet', id: 'q1' }))).resolves.toBe(true);
    expect(created[1].options.silent).toBe(true); // a join should not chirp at you
  });

  it('prefers the worker registration, which is what Android Chrome requires', async () => {
    grantedNotification('granted');
    const showNotification = vi.fn(async (_title: string, _options: NotificationOptions) => undefined);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ showNotification }) } });
    await expect(showDeviceNotification(note())).resolves.toBe(true);
    expect(showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = showNotification.mock.calls[0];
    expect(title).toBe('@gem-ai mentioned you');
    expect(options.data).toMatchObject({ messageId: 'm1', kind: 'mention' });
    expect(options.body).toBe('can you review this?');
  });

  it('gives up quietly when the platform refuses', async () => {
    grantedNotification('granted');
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: async () => {
          throw new Error('SecurityError: only secure contexts');
        },
      },
    });
    await expect(showDeviceNotification(note())).resolves.toBe(false);
  });

  it('records the permission decision, and short-circuits when it is already settled', async () => {
    const fake = vi.fn(() => Promise.resolve('granted'));
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: fake });
    await expect(requestPermission()).resolves.toBe('granted');
    expect(fake).toHaveBeenCalledTimes(1);

    // Granted already: no second prompt, because browsers only ask once.
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: fake });
    await expect(requestPermission()).resolves.toBe('granted');
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it('tolerates Safari\'s callback form, which resolves nothing', async () => {
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: (cb: (value: string) => void) => cb('denied'),
    });
    await expect(requestPermission()).resolves.toBe('denied');

    // A prompt that never answers must not hang the settings panel.
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: () => undefined });
    await expect(requestPermission(20)).resolves.toBe('default');
  });

  it('registers the worker only when the platform has one, and swallows failures', async () => {
    await expect(registerNotifyWorker()).resolves.toBeUndefined(); // no navigator.serviceWorker in node
    const register = vi.fn(async () => ({ scope: '/' }));
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    await registerNotifyWorker();
    expect(register).toHaveBeenCalledWith(SW_PATH, { scope: '/', updateViaCache: 'none' });

    vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn(async () => { throw new Error('blocked'); }) } });
    await expect(registerNotifyWorker()).resolves.toBeUndefined();
  });

  it('does nothing when a chime cannot be built', () => {
    expect(() => playAlert()).not.toThrow();
    const ctx = {
      currentTime: 0,
      state: 'suspended',
      destination: {},
      resume: vi.fn(async () => undefined),
      createOscillator: vi.fn(() => ({
        type: 'sine',
        frequency: { value: 0 },
        connect: () => ({ connect: () => undefined }),
        start: () => undefined,
        stop: () => undefined,
      })),
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: () => ({ connect: () => undefined }),
      })),
    };
    vi.stubGlobal('window', { AudioContext: vi.fn(() => ctx) });
    expect(() => playAlert()).not.toThrow();
    expect(ctx.resume).toHaveBeenCalled();
  });
});
