import * as SecureStore from 'expo-secure-store';

import { kvGet, kvSet } from './db';
import { isPremium } from './premium';
import { createStore } from './store';

/**
 * AI services. Today: bring-your-own Anthropic key, called straight from the device. The hosted and
 * self-hosted Arcanum Server modes slot in beside it with the same request shape and a different base URL.
 */
export type AiMode = 'off' | 'byok' | 'cloud';

export interface AiConfig {
  mode: AiMode;
  model: string;
}

export const AI_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', hint: 'Best picks' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', hint: 'Fastest and cheapest' },
];

export const DEFAULT_AI: AiConfig = { mode: 'off', model: AI_MODELS[0].id };

const CONFIG_KEY = 'aiConfig';
const SECRET_KEY = 'arcanum.ai.anthropicKey';

export const aiStore = createStore<AiConfig & { hasKey: boolean; loaded: boolean }>({
  ...DEFAULT_AI,
  hasKey: false,
  loaded: false,
});

let loading: Promise<void> | null = null;

/** Loads config and key presence once; safe to call from anywhere. */
export function ensureAiLoaded(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const cfg = (await kvGet<AiConfig>(CONFIG_KEY)) ?? {};
      let hasKey = false;
      try {
        hasKey = !!(await SecureStore.getItemAsync(SECRET_KEY));
      } catch {}
      aiStore.set({ ...DEFAULT_AI, ...cfg, hasKey, loaded: true });
    })().catch(() => {
      loading = null;
    });
  }
  return loading;
}

export async function updateAiConfig(patch: Partial<AiConfig>) {
  await ensureAiLoaded();
  const next = { ...aiStore.get(), ...patch };
  await kvSet(CONFIG_KEY, { mode: next.mode, model: next.model });
  aiStore.set(next);
}

export async function setAiKey(key: string | null) {
  const trimmed = key?.trim() || null;
  if (trimmed) await SecureStore.setItemAsync(SECRET_KEY, trimmed);
  else await SecureStore.deleteItemAsync(SECRET_KEY);
  aiStore.set((s) => ({ ...s, hasKey: !!trimmed }));
}

export function aiEnabled() {
  const s = aiStore.get();
  if (s.mode === 'cloud') return isPremium();
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

const SYSTEM = `You help a reader who finds it hard to choose their next book. From the candidate list, pick exactly one
to start right now. Weigh their taste summary heavily, and if they state a mood, treat it as the deciding
factor. Occasionally choose a well-rated outlier so the picks do not get stale. Give a reason in the second
person, at most 30 words, warm and specific, with no spoilers. Answer only by calling the pick_book tool.`;

class AiError extends Error {}

async function anthropic(body: Record<string, unknown>, key: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    throw new AiError(res.status === 401 ? 'That API key was rejected.' : msg);
  }
  return json;
}

/** Ask the model for one pick. Throws with a readable message when the key or network fails. */
export async function aiPick(req: AiPickRequest): Promise<AiPickResult> {
  await ensureAiLoaded();
  if (aiStore.get().mode === 'cloud') {
    // The hosted service is not live yet; the subscription exists so it can be tested in sandbox.
    throw new AiError('Arcanum Cloud is not available yet.');
  }
  const key = await SecureStore.getItemAsync(SECRET_KEY);
  if (!key) throw new AiError('No API key saved.');
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
  const json = await anthropic(
    {
      model: aiStore.get().model,
      max_tokens: 300,
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
      tools: [
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
      ],
      tool_choice: { type: 'tool', name: 'pick_book' },
    },
    key,
  );
  const block = (json?.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
  const input = block?.input as Partial<AiPickResult> | undefined;
  if (!input || typeof input.bookId !== 'number') throw new AiError('The model did not return a pick.');
  const ok = req.candidates.some((c) => c.id === input.bookId);
  if (!ok) throw new AiError('The model chose a book that was not offered.');
  return { bookId: input.bookId, reason: (input.reason ?? '').trim() || 'Worth a try.' };
}

/** Cheapest possible request, to validate a key before saving it. */
export async function testAiKey(key: string, model: string): Promise<void> {
  await anthropic({ model, max_tokens: 5, messages: [{ role: 'user', content: 'Say ok.' }] }, key.trim());
}
