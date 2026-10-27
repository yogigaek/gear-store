// In-memory stand-ins for the phone's storage. They live on globalThis so a test can "relaunch" the app
// (vi.resetModules and import again) and find what the last run stored, as after a real restart.
interface Fakes {
  secure: Map<string, string>;
  storage: Map<string, string>;
  /** makes the next SecureStore writes throw, as a broken Keystore does */
  secureWriteFails: boolean;
  /** runs before each AsyncStorage write: throw to refuse it, or return a promise that never settles to "kill" */
  beforeStorageWrite: ((key: string) => Promise<void> | void) | null;
  /** runs after each AsyncStorage write has landed */
  afterStorageWrite: ((key: string) => Promise<void> | void) | null;
}

const holder = globalThis as typeof globalThis & { __rakitFakes?: Fakes };

export const fakes: Fakes = (holder.__rakitFakes ??= {
  secure: new Map(),
  storage: new Map(),
  secureWriteFails: false,
  beforeStorageWrite: null,
  afterStorageWrite: null,
});

export function resetFakes() {
  fakes.secure.clear();
  fakes.storage.clear();
  fakes.secureWriteFails = false;
  fakes.beforeStorageWrite = null;
  fakes.afterStorageWrite = null;
}

export const secureStore = {
  getItemAsync: async (key: string) => fakes.secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    if (fakes.secureWriteFails) throw new Error('Keystore operation failed');
    fakes.secure.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    fakes.secure.delete(key);
  },
};

async function write(key: string, change: () => void) {
  await fakes.beforeStorageWrite?.(key);
  change();
  await fakes.afterStorageWrite?.(key);
}

export const asyncStorage = {
  getItem: async (key: string) => fakes.storage.get(key) ?? null,
  setItem: (key: string, value: string) => write(key, () => fakes.storage.set(key, value)),
  removeItem: (key: string) => write(key, () => fakes.storage.delete(key)),
};
