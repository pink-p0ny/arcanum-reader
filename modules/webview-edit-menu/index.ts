import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

export interface EditMenuItem {
  key: string;
  label: string;
}

interface Native {
  setItems(items: EditMenuItem[]): void;
  addListener(event: 'onAction', listener: (event: { key: string }) => void): EventSubscription;
}

// Optional: absent in Expo Go, present in development and store builds.
const native = requireOptionalNativeModule<Native>('WebViewEditMenu');

/** True when the native hook is compiled into this binary. */
export const editMenuAvailable = native != null;

/** Actions to show at the front of the WebView's text-selection menu. Pass [] to remove them. */
export function setEditMenuItems(items: EditMenuItem[]): void {
  native?.setItems(items);
}

export function addEditMenuListener(listener: (key: string) => void): EventSubscription | null {
  return native ? native.addListener('onAction', (e) => listener(e.key)) : null;
}
