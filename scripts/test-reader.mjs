// Smoke-tests the bundled reader page in headless Chromium with a real book (EPUB, MOBI, AZW3, FB2, PDF or
// TXT), driving it over the same postMessage bridge the app uses. Usage: node scripts/test-reader.mjs book.epub
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const bookPath = resolve(process.argv[2] ?? 'book.epub');
const ext = bookPath.toLowerCase().split('.').pop();
const bookUrl = `/book.${ext}`;
const html = readFileSync(resolve('assets/reader/reader.html'));
const book = readFileSync(bookPath);
const MIME = { epub: 'application/epub+zip', pdf: 'application/pdf', txt: 'text/plain' };

const server = createServer((req, res) => {
  const extra = resolve('assets/reader', req.url.slice(1));
  if (req.url === bookUrl) {
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(book);
  } else if (/\.webjs$/.test(req.url) && existsSync(extra)) {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(readFileSync(extra));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const messages = [];
await page.exposeFunction('__rnPost', (m) => messages.push(JSON.parse(m)));
await page.addInitScript(() => {
  window.ReactNativeWebView = { postMessage: (m) => window.__rnPost(m) };
});
page.on('console', (m) => console.log('console.' + m.type() + ':', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));

const waitFor = async (type, timeout = 15000, pred = () => true) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const i = messages.findIndex((m) => m.type === type && pred(m));
    if (i >= 0) {
      const found = messages[i];
      messages.splice(0, i + 1);
      return found;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `timeout waiting for ${type}; got ${messages.map((m) => m.type + (m.message ? ':' + m.message : '') + (m.stack ? '\n' + m.stack : '')).join(',')}`,
  );
};
const settle = (ms = 800) => new Promise((r) => setTimeout(r, ms));
const send = (msg) => page.evaluate((m) => window.postMessage(JSON.stringify(m), '*'), msg);

await page.goto(`http://localhost:${port}/`);
await waitFor('ready');
const settings = {
  fontSize: 18,
  lineHeight: 1.5,
  sideMargin: 8,
  verticalMargin: 48,
  maxInlineSize: 720,
  maxColumns: 2,
  fontFamily: null,
  theme: 'sepia',
  flow: 'paginated',
  justify: true,
  hyphenate: true,
  colors: { bg: '#f4ecd8', fg: '#5b4636', link: '#8a5a2b' },
  dark: false,
  forceColors: true,
  // PDFs reflow by default; READER_PDF_PAGES=1 tests the rendered-page mode instead.
  pdfReflow: !process.env.READER_PDF_PAGES,
};
await send({ type: 'open', url: bookUrl, name: `book.${ext}`, position: null, settings, annotations: [] });
const errEarly = messages.find((m) => m.type === 'error');
if (errEarly) console.log('page error:', errEarly.message);
const loaded = await waitFor('loaded', 30000);
console.log('loaded:', loaded.title, '| toc entries:', loaded.toc.length, '| sections:', loaded.sections, loaded.fixed ? '| fixed layout' : '', loaded.pdf ? JSON.stringify(loaded.pdf) : '');
const first = await waitFor('relocate');
console.log('relocate:', first.cfi, first.fraction.toFixed(4), first.tocLabel);
await settle();
messages.length = 0;

await send({ type: 'next' });
const second = await waitFor('relocate', 10000, (m) => m.cfi !== first.cfi);
console.log('after next:', second.cfi, second.fraction.toFixed(4));
await settle();
messages.length = 0;

// Jump to a TOC entry, then to a fraction.
// An entry from the middle of the book, so the jump is a real move away from the second page.
const withHref = loaded.toc.filter((t) => t.href);
const chapter = withHref[Math.floor(withHref.length / 2)] ?? loaded.toc[0];
await send({ type: 'goTo', target: chapter.href });
const r3 = await waitFor('relocate', 10000, (m) => m.cfi !== second.cfi);
console.log('goTo', chapter.label, '→', r3.tocLabel, r3.cfi);
await settle();
messages.length = 0;
await send({ type: 'goToFraction', fraction: 0.5 });
const r4 = await waitFor('relocate', 10000, (m) => Math.abs(m.fraction - 0.5) < 0.05);
console.log('goToFraction 0.5 →', r4.fraction.toFixed(3), r4.tocLabel);
await settle();
messages.length = 0;

let selection = null;
if (loaded.fixed) {
  console.log('fixed layout: no taps, selections, highlights or read-aloud to test');
  // A leftward swipe on the rendered page turns to the next page.
  const before = r4;
  // The fixed-layout renderer replaces its iframes while it lays out a spread; retry until one holds still.
  const swipeLeft = () => {
    const el = document.body;
    const mk = (x) => new Touch({ identifier: 3, target: el, clientX: x, clientY: 200 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk(400)], changedTouches: [mk(400)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [mk(150)] }));
  };
  for (let attempt = 0; ; attempt++) {
    await settle(700);
    const live = page.frames().filter((f) => f !== page.mainFrame() && !f.isDetached());
    try {
      await live[live.length - 1].evaluate(swipeLeft);
      break;
    } catch (e) {
      if (attempt >= 8) throw e;
    }
  }
  const swiped = await waitFor('relocate', 10000, (m) => m.cfi !== before.cfi);
  console.log('swipe →', swiped.cfi, swiped.fraction.toFixed(3));
  if (swiped.fraction <= before.fraction) throw new Error('swipe did not advance');
  await settle(300);
  messages.length = 0;
} else {
// foliate's paginator keeps its iframe in a closed shadow root, so reach the chapter document through
// Playwright's frame list.
const frame = page.frames().find((f) => f !== page.mainFrame());

// Tap handling: a plain click, then a bare touch sequence with no click (what iOS does for taps on
// non-interactive elements). Each must produce exactly one tap message.
const tapTarget = () => {
  // A paragraph that is on the currently visible page (the iframe is wider than the viewport when paginated).
  const fr = window.frameElement.getBoundingClientRect();
  const w = window.parent.innerWidth;
  for (const el of document.querySelectorAll('p, div, span')) {
    for (const r of el.getClientRects()) {
      const x = fr.left + r.left + 5;
      if (r.width > 40 && x > 0 && x < w) return { p: el, x: r.left + 5, y: r.top + 5 };
    }
  }
  throw new Error('no visible paragraph');
};
await frame.evaluate(`(() => {
  const { p, x, y } = (${tapTarget})();
  p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
})()`);
const tap1 = await waitFor('tap', 3000);
await settle(400);
messages.length = 0;
await frame.evaluate(`(() => {
  const { p, x, y } = (${tapTarget})();
  const touch = new Touch({ identifier: 1, target: p, clientX: x, clientY: y });
  p.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch], changedTouches: [touch] }));
  p.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [touch] }));
})()`);
const tap2 = await waitFor('tap', 3000);
await settle(500);
if (messages.some((m) => m.type === 'tap')) throw new Error('duplicate tap message');
for (const t of [tap1, tap2])
  if (!(t.x >= 0 && t.x <= 1 && t.y >= 0 && t.y <= 1)) throw new Error('tap out of range');
console.log('tap via click:', tap1.x.toFixed(2), '| tap via touch only:', tap2.x.toFixed(2));
messages.length = 0;

// Simulate a selection inside the rendered chapter and verify we get a CFI back.
// Pick a long text node rather than a <p>: MOBI books often have none.
const selectText = () => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) if (node.textContent.trim().length > 40) break;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, Math.min(30, node.length));
  const s = document.getSelection();
  s.removeAllRanges();
  s.addRange(range);
  return range.toString();
};
const sel = await frame.evaluate(selectText);
selection = await waitFor('selection');
console.log(
  'selection:',
  JSON.stringify(sel),
  '→ cfi',
  selection.cfi,
  'rect',
  selection.rect && Math.round(selection.rect.y),
);
if (!selection.cfi.startsWith('epubcfi(')) throw new Error('bad cfi');

// With a selection present, a single-finger drag must not be cancelled by foliate's swipe handler
// (that is what lets iOS drag the selection handles); without one it must be, so swipes still work.
const dragCancelled = (withSelection) =>
  frame.evaluate((keep) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) if (node.textContent.trim().length > 40) break;
    const p = node.parentElement;
    if (!keep) document.getSelection().removeAllRanges();
    const r = p.getClientRects()[0];
    const mk = (x) => new Touch({ identifier: 7, target: p, clientX: x, clientY: r.top + 5 });
    const ev = (type, t, extra = {}) =>
      new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: type === 'touchend' ? [] : [t],
        changedTouches: [t],
        ...extra,
      });
    p.dispatchEvent(ev('touchstart', mk(r.left + 10)));
    const allowed = p.dispatchEvent(ev('touchmove', mk(r.left + 60)));
    p.dispatchEvent(ev('touchend', mk(r.left + 60)));
    return !allowed;
  }, withSelection);
const cancelledWhileSelecting = await dragCancelled(true);
const cancelledWhenIdle = await dragCancelled(false);
console.log('drag cancelled while selecting:', cancelledWhileSelecting, '| when idle:', cancelledWhenIdle);
if (cancelledWhileSelecting) throw new Error('selection drag was hijacked by the paginator');
if (!cancelledWhenIdle) throw new Error('swipe no longer handled by the paginator');
await settle(300);
messages.length = 0;
// Restore the selection the following steps rely on.
await frame.evaluate(selectText);
await waitFor('selection');

await send({ type: 'addAnnotation', cfi: selection.cfi, color: '#FACC15', style: 'highlight' });
const added = await waitFor('annotationAdded');
console.log('annotation added in chapter:', JSON.stringify(added.label), 'drawn:', added.drawn);
if (!added.drawn) throw new Error('highlight not drawn');

// Read aloud: ask for the sentences on the current page and highlight the second one.
await send({ type: 'ttsStart' });
const block = await waitFor('ttsBlock', 10000);
console.log(
  'tts block:',
  block.sentences.length,
  'sentences; first:',
  JSON.stringify(block.sentences[0].text.slice(0, 60)),
);
if (block.sentences.length === 0) throw new Error('no tts sentences');
await send({ type: 'ttsMark', mark: block.sentences[Math.min(1, block.sentences.length - 1)].mark });
await settle(300);
await send({ type: 'ttsNext' });
const block2 = await waitFor('ttsBlock', 10000);
console.log('tts next block:', block2.sentences.length, 'sentences');
await send({ type: 'ttsStop' });
messages.length = 0;

}

// Search the whole book, then jump to the first hit and clear.
// READER_SEARCH overrides the term (default suits Pride and Prejudice); READER_DUMP=1 prints every hit's CFI.
const term = process.env.READER_SEARCH ?? 'Netherfield';
await send({ type: 'search', query: term, id: 1 });
const hits = await waitFor('searchResults', 20000, (m) => m.id === 1);
const sdone = await waitFor('searchDone', 30000, (m) => m.id === 1);
console.log(
  'search:',
  hits.items.length,
  'hits in',
  JSON.stringify(hits.label),
  '| first:',
  JSON.stringify(hits.items[0].match),
  '| done:',
  !!sdone,
);
if (process.env.READER_DUMP) for (const h of hits.items) console.log('HIT', JSON.stringify({ cfi: h.cfi, match: h.match, excerpt: h.excerpt ?? h.pre ?? '' }));
if (!hits.items.length || !hits.items[0].match.toLowerCase().includes(term.toLowerCase())) throw new Error('bad search hit');
messages.length = 0;
await send({ type: 'goTo', target: hits.items[0].cfi });
await waitFor('relocate', 10000);
await send({ type: 'clearSearch' });
await settle(300);
messages.length = 0;

// Re-open at the saved CFI and confirm we land on the same spot.
await send({
  type: 'open',
  url: bookUrl,
  name: `book.${ext}`,
  position: { cfi: r4.cfi, fraction: r4.fraction },
  settings: { ...settings, flow: 'scrolled' },
  annotations: selection ? [{ cfi: selection.cfi, color: '#60A5FA', style: 'underline' }] : [],
});
await waitFor('loaded', 30000);
const r5 = await waitFor('relocate');
console.log('reopen at cfi → fraction', r5.fraction.toFixed(3), '(expected ~', r4.fraction.toFixed(3), ')');
// Reopening switches to scrolled flow, which lays the section out differently; with one section per
// page (PDF) a section is a large share of the book, so allow a section's worth of drift.
if (Math.abs(r5.fraction - r4.fraction) > Math.max(0.02, 1 / loaded.sections)) throw new Error('did not restore position');

const errors = messages.filter((m) => m.type === 'error');
if (errors.length) console.log('errors:', errors);
await page.screenshot({ path: resolve(process.env.READER_SCREENSHOT || 'reader-test.png') });
await browser.close();
server.close();
console.log(errors.length ? 'DONE WITH ERRORS' : 'OK');
