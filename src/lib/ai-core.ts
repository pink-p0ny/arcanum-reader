/**
 * Pure helpers for the AI client: where a request goes for each mode and how failures read. No Expo
 * imports, so `npm test` covers it.
 */
export type AiMode = 'off' | 'byok' | 'cloud' | 'self';

/** The hosted Arcanum Server. */
export const CLOUD_URL = 'https://cloud.arcanum-reader.app';
const ANTHROPIC_URL = 'https://api.anthropic.com';

export class AiError extends Error {}

export interface Endpoint {
  /** Base URL; `/v1/messages` and `/v1/me` hang off it. */
  base: string;
  headers: Record<string, string>;
}

export interface Credentials {
  anthropicKey?: string | null;
  subscriberId?: string | null;
  selfUrl?: string | null;
  selfToken?: string | null;
}

const VERSION = { 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };

/** A server address as typed by the user: scheme added, trailing slashes and a pasted route dropped. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+(v1(\/(messages|me))?)?\/*$/i, '').replace(/\/+$/, '');
}

export function resolveEndpoint(mode: AiMode, c: Credentials): Endpoint {
  switch (mode) {
    case 'byok':
      if (!c.anthropicKey) throw new AiError('No API key saved.');
      return { base: ANTHROPIC_URL, headers: { ...VERSION, 'x-api-key': c.anthropicKey } };
    case 'cloud':
      if (!c.subscriberId) throw new AiError('Arcanum Cloud needs the App Store build; purchases are not available here.');
      return { base: CLOUD_URL, headers: { ...VERSION, authorization: `Bearer ${c.subscriberId}` } };
    case 'self':
      if (!c.selfUrl || !c.selfToken) throw new AiError('Self-hosted server address or access token missing.');
      return { base: normalizeServerUrl(c.selfUrl), headers: { ...VERSION, authorization: `Bearer ${c.selfToken}` } };
    default:
      throw new AiError('AI picks are off.');
  }
}

/** A readable sentence for a failed call, by mode. */
export function messageForFailure(mode: AiMode, status: number, json: unknown): string {
  const upstream = (json as { error?: { message?: string } } | null)?.error?.message;
  if (status === 401) {
    if (mode === 'byok') return 'That API key was rejected.';
    if (mode === 'self') return 'The server rejected the access token.';
    return 'Arcanum Cloud did not recognise this subscription. Try Restore Purchases.';
  }
  if (status === 402) return 'Arcanum Cloud is not active on this Apple ID.';
  if (status === 429) return upstream ?? 'Daily limit reached. Try again tomorrow.';
  if (status === 503 && mode !== 'byok') return upstream ?? 'The server is temporarily unavailable.';
  return upstream ?? `HTTP ${status}`;
}
