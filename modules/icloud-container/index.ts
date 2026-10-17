import { requireOptionalNativeModule } from 'expo-modules-core';

interface Native {
  getDocumentsUrl(): Promise<string | null>;
  startDownload(path: string): Promise<void>;
  isDownloaded(path: string): Promise<boolean>;
}

// Absent in Expo Go; present in development and store builds.
const native = requireOptionalNativeModule<Native>('ICloudContainer');

export const iCloudAvailableInBinary = native != null;

/** file:// URL of the app's iCloud Drive Documents folder, or null when iCloud is off or unsupported. */
export async function iCloudDocumentsUrl(): Promise<string | null> {
  if (!native) return null;
  try {
    return await native.getDocumentsUrl();
  } catch {
    return null;
  }
}

export async function ensureDownloaded(fileUri: string): Promise<boolean> {
  if (!native) return true;
  try {
    if (await native.isDownloaded(fileUri)) return true;
    await native.startDownload(fileUri);
    return false;
  } catch {
    return true;
  }
}
