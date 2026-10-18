import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

let cached: Promise<string> | null = null;

/** The page plus pdf.js, which the page loads from its own folder when a PDF opens. */
/* eslint-disable @typescript-eslint/no-require-imports */
const ASSETS: [number, string][] = [
  [require('../../assets/reader/reader.html'), 'reader.html'],
  [require('../../assets/reader/pdfjs.webjs'), 'pdfjs.webjs'],
  [require('../../assets/reader/pdf.worker.webjs'), 'pdf.worker.webjs'],
];
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * The reader page ships as a bundled asset. WKWebView only lets a page read sibling files when it was loaded
 * from a file URL under `allowingReadAccessToURL`, so we copy it next to the downloaded books in Documents.
 */
export function readerPageUri(): Promise<string> {
  if (!cached) {
    cached = (async () => {
      const dir = new Directory(Paths.document, 'reader');
      if (!dir.exists) dir.create({ intermediates: true });
      let page = '';
      for (const [module, name] of ASSETS) {
        const asset = Asset.fromModule(module);
        await asset.downloadAsync();
        if (!asset.localUri) throw new Error(`Reader asset missing: ${name}`);
        const dest = new File(dir, name);
        if (dest.exists) dest.delete();
        new File(asset.localUri).copy(dest);
        if (name === 'reader.html') page = dest.uri;
      }
      return page;
    })().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}
