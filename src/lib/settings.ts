import { kvGet, kvSet } from './db';
import { createStore } from './store';

export type ReaderTheme = 'system' | 'light' | 'sepia' | 'dark';
export type ReaderFlow = 'paginated' | 'scrolled';

export interface ReaderSettings {
  fontSize: number; // px
  lineHeight: number; // unitless
  /** Side margins as a percentage of the page width (foliate "gap"). */
  sideMargin: number;
  /** Top and bottom margins in px (foliate "margin"). */
  verticalMargin: number;
  /** Maximum text column width in px. */
  maxInlineSize: number;
  maxColumns: 1 | 2;
  fontFamily: string | null;
  theme: ReaderTheme;
  flow: ReaderFlow;
  justify: boolean;
  hyphenate: boolean;
  ttsRate: number;
  ttsVoice: string | null;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.5,
  sideMargin: 8,
  verticalMargin: 56,
  maxInlineSize: 720,
  maxColumns: 2,
  fontFamily: null,
  theme: 'system',
  flow: 'paginated',
  justify: true,
  hyphenate: true,
  ttsRate: 1,
  ttsVoice: null,
};

export const FONT_CHOICES: { label: string; value: string | null }[] = [
  { label: 'Publisher', value: null },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Palatino', value: '"Palatino", "Book Antiqua", serif' },
  { label: 'Charter', value: '"Charter", "Iowan Old Style", serif' },
  { label: 'New York', value: 'ui-serif, "New York", serif' },
  { label: 'San Francisco', value: '-apple-system, system-ui, sans-serif' },
  { label: 'Avenir', value: '"Avenir Next", Avenir, sans-serif' },
];

export const THEME_COLORS: Record<
  Exclude<ReaderTheme, 'system'>,
  { bg: string; fg: string; link: string }
> = {
  light: { bg: '#ffffff', fg: '#1d1d1f', link: '#0a66c2' },
  sepia: { bg: '#f4ecd8', fg: '#5b4636', link: '#8a5a2b' },
  dark: { bg: '#121212', fg: '#d6d6d6', link: '#6cb4ff' },
};

const KEY = 'readerSettings';

export const settingsStore = createStore<ReaderSettings>(DEFAULT_READER_SETTINGS);

export async function loadSettings() {
  const saved = await kvGet<Partial<ReaderSettings>>(KEY);
  if (saved) settingsStore.set({ ...DEFAULT_READER_SETTINGS, ...saved });
}

export async function updateSettings(patch: Partial<ReaderSettings>) {
  const next = { ...settingsStore.get(), ...patch };
  settingsStore.set(next);
  await kvSet(KEY, next);
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
