import { Platform, Settings } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { createStore } from './store';
import type { AccessTokenDto } from './types';

export type ServerKind = 'grimmory' | 'booklore';

export interface Session {
  serverUrl: string;
  /** Which API dialect the server speaks. Detected at sign-in; absent on sessions saved before detection. */
  kind?: ServerKind;
  username: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  accessExpiresAt: number;
}

const KEY = 'grimmory.session';

export const sessionStore = createStore<{
  ready: boolean;
  session: Session | null;
}>({
  ready: false,
  session: null,
});

/** True when the user chose to use Arcanum without a server (folder library only). */
export const localOnlyStore = createStore<boolean>(false);
const LOCAL_ONLY_KEY = 'arcanum.localOnly';

export async function loadLocalOnly() {
  try {
    localOnlyStore.set(launchedLocalOnly() || (await SecureStore.getItemAsync(LOCAL_ONLY_KEY)) === '1');
  } catch {
    localOnlyStore.set(false);
  }
}

/**
 * `xcrun simctl launch <udid> net.snobunny.arcanum -arcanumLocalOnly 1` starts the app in folder-only
 * mode without touching the keychain; iOS puts `-key value` launch arguments into NSUserDefaults, which
 * React Native's Settings reads. Used by scripts/screenshots.sh.
 */
function launchedLocalOnly() {
  if (Platform.OS !== 'ios') return false;
  try {
    return String(Settings.get('arcanumLocalOnly') ?? '') === '1';
  } catch {
    return false;
  }
}

export async function setLocalOnly(on: boolean) {
  if (on) await SecureStore.setItemAsync(LOCAL_ONLY_KEY, '1');
  else await SecureStore.deleteItemAsync(LOCAL_ONLY_KEY);
  localOnlyStore.set(on);
}

export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

function jwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function sessionFromTokens(
  serverUrl: string,
  username: string,
  dto: AccessTokenDto,
  kind?: ServerKind,
): Session {
  const fromJwt = jwtExpiryMs(dto.accessToken);
  const fromDto = dto.expires ? Date.now() + dto.expires * 1000 : null;
  return {
    serverUrl,
    kind,
    username,
    accessToken: dto.accessToken,
    refreshToken: dto.refreshToken,
    accessExpiresAt: fromJwt ?? fromDto ?? Date.now() + 60 * 60 * 1000,
  };
}

async function persist(session: Session | null) {
  if (session) await SecureStore.setItemAsync(KEY, JSON.stringify(session));
  else await SecureStore.deleteItemAsync(KEY);
  sessionStore.set({ ready: true, session });
}

export async function loadSession() {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    sessionStore.set({
      ready: true,
      session: raw ? (JSON.parse(raw) as Session) : null,
    });
  } catch {
    sessionStore.set({ ready: true, session: null });
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.message ?? body?.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function login(serverUrlInput: string, username: string, password: string) {
  const serverUrl = normalizeServerUrl(serverUrlInput);
  const res = await fetch(`${serverUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok)
    throw new ApiError(res.status, res.status === 401 ? 'Wrong username or password' : await readError(res));
  const dto = (await res.json()) as AccessTokenDto;
  await persist(sessionFromTokens(serverUrl, username, dto, await detectKind(serverUrl, dto.accessToken)));
}

/**
 * Grimmory adds `/api/v1/app/*` mobile endpoints on top of Booklore's API. A server that answers 404 or 405
 * there is plain Booklore. Network trouble during the probe assumes Grimmory, the richer dialect.
 */
async function detectKind(serverUrl: string, accessToken: string): Promise<ServerKind> {
  try {
    const res = await fetch(`${serverUrl}/api/v1/app/books?page=0&size=1`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    return res.status === 404 || res.status === 405 ? 'booklore' : 'grimmory';
  } catch {
    return 'grimmory';
  }
}

export async function logout() {
  await persist(null);
}

let refreshing: Promise<Session | null> | null = null;

/** Refresh the access token. Returns null (and clears the session) when the refresh token is rejected. */
export function refreshSession(): Promise<Session | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const current = sessionStore.get().session;
    if (!current) return null;
    try {
      const res = await fetch(`${current.serverUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (res.status === 401 || res.status === 403) {
        await persist(null);
        return null;
      }
      if (!res.ok) throw new ApiError(res.status, await readError(res));
      const dto = (await res.json()) as AccessTokenDto;
      const next = sessionFromTokens(current.serverUrl, current.username, dto, current.kind);
      await persist(next);
      return next;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Returns a session whose access token is valid for at least a couple of minutes. */
export async function getFreshSession(): Promise<Session | null> {
  const s = sessionStore.get().session;
  if (!s) return null;
  if (s.accessExpiresAt - Date.now() > 2 * 60 * 1000) return s;
  try {
    return await refreshSession();
  } catch {
    // Network trouble: keep using the current token and let the caller handle a 401.
    return s;
  }
}
