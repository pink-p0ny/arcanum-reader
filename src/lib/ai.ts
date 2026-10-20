import * as SecureStore from 'expo-secure-store';

import { AiError, type AiMode, messageForFailure, normalizeServerUrl, resolveEndpoint, type Endpoint } from './ai-core';
import { kvGet, kvSet } from './db';
import { isPremium, subscriberId } from './premium';
import { createStore } from './store';

/**
 * AI services. Four ways to run them, one request shape: off; bring-your-own Anthropic key straight from
 * the device; Arcanum Cloud (the hosted Arcanum Server, unlocked by the subscription); or a self-hosted
 * Arcanum Server with a shared access token. Only the base URL and the credential differ.
 */
export type { AiMode };

export interface AiConfig {
  mode: AiMode;
  model: string;
  /** Self-hosted Arcanum Server address. The token lives in the keychain. */
  selfUrl: string;
}

export const AI_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', hint: 'Best picks' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', hint: 'Fastest and cheapest' },
];

export const DEFAULT_AI: AiConfig = { mode: 'off', model: AI_MODELS[0].id, selfUrl: '' };

const CONFIG_KEY = 'aiConfig';
const SECRET_KEY = 'arcanum.ai.anthropicKey';
const SELF_TOKEN_KEY = 'arcanum.ai.selfToken';

export const aiStore = createStore<AiConfig & { hasKey: boolean; hasSelfToken: boolean; loaded: boolean }>({
  ...DEFAULT_AI,
  hasKey: false,
  hasSelfToken: false,
  loaded: false,
});

let loading: Promise<void> | null = null;

/** Loads config and credential presence once; safe to call from anywhere. */
export function ensureAiLoaded(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const cfg = (await kvGet<Partial<AiConfig>>(CONFIG_KEY)) ?? {};
      let hasKey = false;
      let hasSelfToken = false;
      try {
        hasKey = !!(await SecureStore.getItemAsync(SECRET_KEY));
        hasSelfToken = !!(await SecureStore.getItemAsync(SELF_TOKEN_KEY));
      } catch {}
      aiStore.set({ ...DEFAULT_AI, ...cfg, hasKey, hasSelfToken, loaded: true });
    })().catch(() => {
      loading = null;
    });
  }
  return loading;
}

export async function updateAiConfig(patch: Partial<AiConfig>) {
  await ensureAiLoaded();
  const next = { ...aiStore.get(), ...patch };
  await kvSet(CONFIG_KEY, { mode: next.mode, model: next.model, selfUrl: next.selfUrl });
  aiStore.set(next);
}

export async function setAiKey(key: string | null) {
  const trimmed = key?.trim() || null;
  if (trimmed) await SecureStore.setItemAsync(SECRET_KEY, trimmed);
  else await SecureStore.deleteItemAsync(SECRET_KEY);
  aiStore.set((s) => ({ ...s, hasKey: !!trimmed }));
}

/** Saves a self-hosted server and its access token; pass null for the token to forget both. */
export async function setSelfHosted(url: string, token: string | null) {
  const trimmed = token?.trim() || null;
  if (trimmed) await SecureStore.setItemAsync(SELF_TOKEN_KEY, trimmed);
  else await SecureStore.deleteItemAsync(SELF_TOKEN_KEY);
  await updateAiConfig({ selfUrl: trimmed ? normalizeServerUrl(url) : '' });
  aiStore.set((s) => ({ ...s, hasSelfToken: !!trimmed }));
}

export function aiEnabled() {
  const s = aiStore.get();
  if (s.mode === 'cloud') return isPremium();
  if (s.mode === 'self') return !!s.selfUrl && s.hasSelfToken;
  return s.mode === 'byok' && s.hasKey;
}

export interface AiCandidate {
  id: number;
  title: string;
  authors: string;
  genres: string[];
  rating: number | null;
  series: string | null;
}

export interface AiPickRequest {
  candidates: AiCandidate[];
  /** A few lines about what the reader finishes and rates highly. Never the whole library. */
  taste: string;
  mood?: string;
}

export interface AiPickResult {
  bookId: number;
  reason: string;
}

/** What `/v1/me` on an Arcanum Server reports. */
export interface ServerStatus {
  mode: 'hosted' | 'self-hosted';
  expiresAt: number | null;
  models: string[];
  maxTokens: number;
  quota: { used: number; limit: number; resetsAt: string };
}

const SYSTEM = `You help a reader who finds it hard to choose their next book. From the candidate list, pick exactly one
to start right now. Weigh their taste summary heavily, and if they state a mood, treat it as the deciding
factor. Occasionally choose a well-rated outlier so the picks do not get stale. Give a reason in the second
person, at most 30 words, warm and specific, with no spoilers. Always answer by calling the pick_book tool; never
reply in prose.`;

/** The endpoint for the current mode, with its credential from the keychain or RevenueCat. */
async function currentEndpoint(): Promise<{ mode: AiMode; ep: Endpoint }> {
  await ensureAiLoaded();
  const { mode, selfUrl } = aiStore.get();
  const ep = resolveEndpoint(mode, {
    anthropicKey: mode === 'byok' ? await SecureStore.getItemAsync(SECRET_KEY) : null,
    subscriberId: mode === 'cloud' ? await subscriberId() : null,
    selfUrl,
    selfToken: mode === 'self' ? await SecureStore.getItemAsync(SELF_TOKEN_KEY) : null,
  });
  return { mode, ep };
}

async function messages(body: Record<string, unknown>, mode: AiMode, ep: Endpoint) {
  const res = await fetch(`${ep.base}/v1/messages`, { method: 'POST', headers: ep.headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new AiError(messageForFailure(mode, res.status, json));
  return json;
}

/** Ask the model for one pick. Throws with a readable message when the credential or network fails. */
export async function aiPick(req: AiPickRequest): Promise<AiPickResult> {
  const { mode, ep } = await currentEndpoint();
  const lines = req.candidates.map(
    (c) =>
      `${c.id} | ${c.title} | ${c.authors}${c.series ? ` | ${c.series}` : ''} | ${c.genres.join(', ') || '-'}${
        c.rating ? ` | ${c.rating.toFixed(1)}/5` : ''
      }`,
  );
  const user = [
    'Reader taste:',
    req.taste,
    req.mood ? `\nMood right now: ${req.mood}` : '',
    '\nCandidates (id | title | authors | series | genres | rating):',
    ...lines,
  ].join('\n');
  const tools = [
    {
      name: 'pick_book',
      description: 'Choose one candidate book by id and explain why in one short sentence.',
      input_schema: {
        type: 'object',
        properties: {
          bookId: { type: 'integer', description: 'The id of the chosen candidate' },
          reason: { type: 'string', description: 'At most 30 words, second person, no spoilers' },
        },
        required: ['bookId', 'reason'],
      },
    },
  ];
  const turns: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: user }];
  const base = { model: aiStore.get().model, max_tokens: 1024, system: SYSTEM, tools };
  // Forced tool use (`tool_choice: tool`) is refused by some models, so the model decides; when it answers
  // in prose instead, one follow-up turn asks for the call.
  let json = await messages({ ...base, messages: turns, tool_choice: { type: 'auto' } }, mode, ep);
  if (!(json?.content ?? []).some((b: { type: string }) => b.type === 'tool_use')) {
    turns.push({ role: 'assistant', content: json?.content ?? [] });
    turns.push({ role: 'user', content: 'Now call the pick_book tool with your choice.' });
    json = await messages({ ...base, messages: turns, tool_choice: { type: 'auto' } }, mode, ep);
  }
  const content: { type: string; input?: unknown; text?: string }[] = json?.content ?? [];
  const block = content.find((b) => b.type === 'tool_use');
  let input = block?.input as Partial<AiPickResult> | undefined;
  if (!input) {
    // The model answered in prose; accept a JSON object with bookId and reason if it included one.
    const text = content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n');
    const m = text.match(/\{[\s\S]*?"bookId"[\s\S]*?\}/);
    if (m) {
      try {
        input = JSON.parse(m[0]);
      } catch {}
    }
  }
  if (input && typeof input.bookId === 'string' && /^-?\d+$/.test(input.bookId)) input.bookId = Number(input.bookId);
  if (!input || typeof input.bookId !== 'number') {
    const why = json?.stop_reason === 'max_tokens' ? 'ran out of room' : `stop reason ${json?.stop_reason ?? 'unknown'}`;
    throw new AiError(`The model did not return a pick (${why}).`);
  }
  const ok = req.candidates.some((c) => c.id === input.bookId);
  if (!ok) throw new AiError('The model chose a book that was not offered.');
  return { bookId: input.bookId, reason: (input.reason ?? '').trim() || 'Worth a try.' };
}

/** Cheapest possible request, to validate an Anthropic key before saving it. */
export async function testAiKey(key: string, model: string): Promise<void> {
  const ep = resolveEndpoint('byok', { anthropicKey: key.trim() });
  await messages({ model, max_tokens: 5, messages: [{ role: 'user', content: 'Say ok.' }] }, 'byok', ep);
}

async function me(mode: AiMode, ep: Endpoint): Promise<ServerStatus> {
  const res = await fetch(`${ep.base}/v1/me`, { headers: ep.headers });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new AiError(messageForFailure(mode, res.status, json));
  return json as ServerStatus;
}

/** Checks a self-hosted server and token before saving them. */
export function testSelfHosted(url: string, token: string): Promise<ServerStatus> {
  return me('self', resolveEndpoint('self', { selfUrl: url, selfToken: token.trim() }));
}

/** Subscription and quota as the hosted server sees them, or null when the mode is not cloud. */
export async function cloudStatus(): Promise<ServerStatus | null> {
  await ensureAiLoaded();
  if (aiStore.get().mode !== 'cloud') return null;
  const { ep } = await currentEndpoint();
  return me('cloud', ep);
}
