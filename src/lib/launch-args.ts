import { Platform, Settings } from 'react-native';

/**
 * Launch arguments for automation: `xcrun simctl launch <udid> net.snobunny.arcanum -arcanumRoute /library`.
 * iOS puts `-key value` arguments into NSUserDefaults, which React Native's Settings reads. Used by
 * scripts/screenshots.sh; harmless on a real device, where nothing sets them.
 */
export function launchArg(name: string): string | null {
  if (Platform.OS !== 'ios') return null;
  try {
    const v = Settings.get(name);
    return v == null ? null : String(v);
  } catch {
    return null;
  }
}
