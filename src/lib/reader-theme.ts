import type { ColorSchemeName } from 'react-native';

import { THEME_COLORS, type ReaderSettings } from './settings';

/** Settings as the WebView page consumes them: colors already resolved against the system scheme. */
export interface ResolvedReaderSettings extends ReaderSettings {
  colors: { bg: string; fg: string; link: string };
  dark: boolean;
  forceColors: boolean;
}

export function resolveReaderSettings(
  s: ReaderSettings,
  scheme: ColorSchemeName | null | undefined,
): ResolvedReaderSettings {
  const theme = s.theme === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : s.theme;
  const colors = THEME_COLORS[theme];
  return {
    ...s,
    colors,
    dark: theme === 'dark',
    forceColors: theme !== 'light',
  };
}
