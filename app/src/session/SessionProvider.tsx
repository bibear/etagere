import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { ApiClient } from '../api/client';
import { SESSION_STORAGE_KEY } from './constants';
import { defaultServerUrl } from './serverUrl';

/** The profile of this device, as created at onboarding. */
export interface DeviceProfile {
  id: string;
  name: string;
  color: string;
}

interface StoredSession {
  profile: DeviceProfile | null;
  serverUrl: string | null;
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface Session {
  status: 'loading' | 'ready';
  profile: DeviceProfile | null;
  /** Saved server address, else the default for this platform. */
  serverUrl: string;
  /** True when the user saved an address (vs the platform default). */
  hasSavedServerUrl: boolean;
  /** Client bound to the server URL and the profile id. */
  api: ApiClient;
  saveProfile(profile: DeviceProfile): Promise<void>;
  saveServerUrl(url: string | null): Promise<void>;
  /** Forgets the profile on this device (the server keeps its history). */
  forgetProfile(): Promise<void>;
}

/** A fresh UUID v4 for a new profile. */
export const newProfileId = (): string => randomUUID();

const platformDefaultUrl = (): string =>
  defaultServerUrl({
    os: Platform.OS,
    dev: typeof __DEV__ !== 'undefined' && __DEV__,
    location: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location : undefined,
  });

const EMPTY: StoredSession = { profile: null, serverUrl: null };

const SessionContext = createContext<Session | null>(null);

const parse = (raw: string | null): StoredSession => {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<StoredSession>) : {};
    return { profile: value.profile ?? null, serverUrl: value.serverUrl ?? null };
  } catch {
    return { profile: null, serverUrl: null };
  }
};

export function SessionProvider({
  children,
  storage = AsyncStorage,
  fetch: fetchImpl,
  defaultUrl,
  initial,
}: {
  children: ReactNode;
  storage?: KeyValueStorage;
  /** Injected network (tests). */
  fetch?: typeof fetch;
  defaultUrl?: string;
  /** Skips loading from storage (tests). */
  initial?: StoredSession;
}) {
  const [stored, setStored] = useState<StoredSession | null>(initial ?? null);
  const fallbackUrl = useMemo(() => defaultUrl ?? platformDefaultUrl(), [defaultUrl]);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    storage
      .getItem(SESSION_STORAGE_KEY)
      .catch(() => null)
      .then((raw) => {
        if (!cancelled) setStored(parse(raw));
      });
    return () => {
      cancelled = true;
    };
  }, [storage, initial]);

  const persist = useCallback(
    async (next: StoredSession) => {
      setStored(next);
      await storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
    },
    [storage],
  );

  const current = useMemo(() => stored ?? EMPTY, [stored]);
  const serverUrl = current.serverUrl ?? fallbackUrl;
  const profileId = current.profile?.id ?? null;
  const api = useMemo(
    () => new ApiClient({ baseUrl: serverUrl, profileId, fetch: fetchImpl }),
    [serverUrl, profileId, fetchImpl],
  );

  const value = useMemo<Session>(
    () => ({
      status: stored ? 'ready' : 'loading',
      profile: current.profile,
      serverUrl,
      hasSavedServerUrl: current.serverUrl !== null,
      api,
      saveProfile: (profile) => persist({ ...current, profile }),
      saveServerUrl: (url) => persist({ ...current, serverUrl: url }),
      forgetProfile: () => persist({ ...current, profile: null }),
    }),
    [stored, current, serverUrl, api, persist],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside <SessionProvider>');
  return session;
}

/** The API client of the current session. */
export const useApi = (): ApiClient => useSession().api;
