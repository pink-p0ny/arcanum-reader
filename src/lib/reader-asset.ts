import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

let cached: Promise<string> | null = null;

/**
 * The reader page ships as a bundled asset. WKWebView only lets a page read sibling files when it was loaded
 * from a file URL under `allowingReadAccessToURL`, so we copy it next to the downloaded books in Documents.
 */
export function readerPageUri(): Promise<string> {
  if (!cached) {
    cached = (async () => {
      const asset = Asset.fromModule(require('../../assets/reader/reader.html'));
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error('Reader asset missing');
      const dir = new Directory(Paths.document, 'reader');
      if (!dir.exists) dir.create({ intermediates: true });
      const dest = new File(dir, 'reader.html');
      if (dest.exists) dest.delete();
      new File(asset.localUri).copy(dest);
      return dest.uri;
    })().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}
