// Smoke-tests the bundled reader page in headless Chromium with a real book (EPUB, MOBI, AZW3, FB2, PDF,
// CBZ, CBR or TXT), driving it over the same postMessage bridge the app uses. Usage: node scripts/test-reader.mjs book.epub
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const bookPath = resolve(process.argv[2] ?? 'book.epub');
const ext = bookPath.toLowerCase().split('.').pop();
const bookUrl = `/book.${ext}`;
const html = readFileSync(resolve('assets/reader/reader.html'));
const book = readFileSync(bookPath);
const MIME = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  txt: 'text/plain',
  cbz: 'application/vnd.comicbook+zip',
  cbr: 'application/vnd.comicbook-rar',
};

const server = createServer((req, res) => {
  const extra = resolve('assets/reader', req.url.slice(1));
  if (req.url === bookUrl) {
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(book);
  } else if (/\.webjs$/.test(req.url) && existsSync(extra)) {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(readFileSync(extra));
  } else if (/\.wasm$/.test(req.url) && existsSync(extra)) {
    res.writeHead(200, { 'Content-Type': 'application/wasm' });
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
  // Scanned PDFs (one image per page, OCR text) show their pages unless READER_PDF_REFLOW_SCANS=1.
  pdfReflowScans: !!process.env.READER_PDF_REFLOW_SCANS,
  // Comics follow their ComicInfo by default; READER_COMIC_DIRECTION=rtl (or ltr) forces the page order.
  comicDirection: process.env.READER_COMIC_DIRECTION ?? 'auto',
};
// READER_START_CFI opens the book at a saved position, as the app does when it resumes; a CFI that no longer
// matches the file (another edition, a page CFI from a PDF) must still land on a page.
const startCfi = process.env.READER_START_CFI ?? null;
await send({
  type: 'open',
  url: bookUrl,
  name: `book.${ext}`,
  position: startCfi ? { cfi: startCfi, href: null, fraction: 0 } : null,
  settings,
  annotations: [],
});
const errEarly = messages.find((m) => m.type === 'error');
if (errEarly) console.log('page error:', errEarly.message);
const loaded = await waitFor('loaded', 30000);
console.log('loaded:', loaded.title, '| toc entries:', loaded.toc.length, '| sections:', loaded.sections, loaded.fixed ? '| fixed layout' : '', loaded.pdf ? JSON.stringify(loaded.pdf) : '', loaded.comic ? JSON.stringify(loaded.comic) : '');
const first = await waitFor('relocate');
console.log('relocate:', first.cfi, first.fraction.toFixed(4), first.tocLabel);
if (loaded.pdf?.scanned) {
  const want = !!process.env.READER_PDF_REFLOW_SCANS;
  if (loaded.pdf.reflow !== want) throw new Error(`scanned PDF reflow=${loaded.pdf.reflow}, expected ${want}`);
  if (!loaded.pdf.text) throw new Error('scanned PDF with OCR text reported no text');
  console.log('scanned PDF:', want ? 'reflowed on request' : 'shown as pages');
} else if (loaded.pdf && /scan/.test(process.argv[2] ?? '')) throw new Error('scan fixture not detected as scanned');

// Links on the opening page (a contents page in badstart.epub): each one either lands in the book, or is
// marked data-expect="none" and must leave the position alone.
const liveNow = () => page.frames().filter((f) => f !== page.mainFrame() && !f.isDetached()).at(-1);
const links = await liveNow().evaluate(() =>
  [...document.querySelectorAll('a[href]')]
    .filter((a) => !/^\w+:/.test(a.getAttribute('href')))
    .slice(0, 3)
    .map((a) => ({ href: a.getAttribute('href'), expect: a.dataset.expect ?? null })),
);
for (const [i, link] of links.entries()) {
  if (i > 0) {
    messages.length = 0;
    await send({ type: 'goTo', target: 0 });
    await waitFor('relocate', 5000);
    await settle(300);
  }
  messages.length = 0;
  await liveNow().evaluate((n) => {
    const a = [...document.querySelectorAll('a[href]')].filter((x) => !/^\w+:/.test(x.getAttribute('href')))[n];
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, i);
  if (link.expect === 'none') {
    await settle(1200);
    const moved = messages.find((m) => m.type === 'relocate' && m.cfi !== first.cfi);
    if (moved) throw new Error(`link ${link.href} should go nowhere but relocated to ${moved.cfi}`);
    console.log('link', link.href, '→ stays, as expected');
  } else {
    const r = await waitFor('relocate', 5000, (m) => m.cfi !== first.cfi);
    if (link.expect && r.tocLabel !== link.expect) throw new Error(`link ${link.href} landed on ${r.tocLabel}, expected ${link.expect}`);
    console.log('link', link.href, '→', r.tocLabel ?? r.cfi);
  }
}
if (links.length) {
  messages.length = 0;
  await send({ type: 'goTo', target: 0 });
  await waitFor('relocate', 5000);
  await settle(300);
}
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
const chapter = withHref[Math.floor(withHref.length / 2)];
if (chapter) {
  await send({ type: 'goTo', target: chapter.href });
  const r3 = await waitFor('relocate', 10000, (m) => m.cfi !== second.cfi);
  console.log('goTo', chapter.label, '→', r3.tocLabel, r3.cfi);
  await settle();
} else console.log('no contents to jump to');
messages.length = 0;
await send({ type: 'goToFraction', fraction: 0.5 });
const r4 = await waitFor('relocate', 10000, (m) => Math.abs(m.fraction - 0.5) < 0.05);
console.log('goToFraction 0.5 →', r4.fraction.toFixed(3), r4.tocLabel);
await settle();
messages.length = 0;

let selection = null;
if (loaded.comic) {
  // Comic pages are single images: one must have decoded to a real size in a live frame.
  const drawn = await page.evaluate(() =>
    document
      .querySelector('foliate-view')
      ?.renderer?.getContents?.()
      .some((c) => [...c.doc.images].some((img) => img.complete && img.naturalWidth > 0)),
  );
  if (!drawn) throw new Error('no comic page image rendered');
  console.log('comic page image rendered');
}
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
  // Right-to-left comics turn the other way: a leftward swipe goes back.
  const advanced = loaded.comic?.rtl ? swiped.fraction < before.fraction : swiped.fraction > before.fraction;
  if (!advanced) throw new Error('swipe did not advance');
  await settle(300);
  messages.length = 0;
} else {
// foliate's paginator keeps its iframe in a closed shadow root, so reach the chapter document through
// Playwright's frame list.
let frame = page.frames().find((f) => f !== page.mainFrame());

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

// Swipes in a reflowable book: foliate drags the page, main.js decides the release from the whole gesture
// and keeps further touches away from foliate while a turn is in flight (see guardSwipes).
// The book's frame runs without scripts (sandbox), so its timers never fire: pace the gesture from here.
// A turn across a section replaces the frame, so each touch goes to whichever frame is live, like a finger.
const liveFrame = () => page.frames().filter((f) => f !== page.mainFrame() && !f.isDetached()).at(-1);
const fire = async (type, p, down) => {
  try {
    await liveFrame().evaluate(`(() => {
      const el = document.body;
      if (!el) return;
      const t = new Touch({ identifier: 7, target: el, clientX: ${p.x}, clientY: ${p.y}, screenX: ${p.x}, screenY: ${p.y} });
      el.dispatchEvent(new TouchEvent('${type}', { bubbles: true, cancelable: true, touches: ${down ? '[t]' : '[]'}, changedTouches: [t] }));
    })()`);
  } catch (e) {
    if (!/detached/i.test(String(e))) throw e;
  }
};
const swipe = async (points) => {
  await fire('touchstart', points[0], true);
  for (const p of points.slice(1)) {
    await settle(p.wait);
    await fire('touchmove', p, true);
  }
  const last = points[points.length - 1];
  await settle(last.release ?? 16);
  await fire('touchend', last, false);
};
const drag = (x0, x1, steps, stepMs, hold = 0) => {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push({ x: Math.round(x0 + ((x1 - x0) * i) / steps), y: 300, wait: stepMs });
  if (hold) pts.push({ x: x1 + Math.sign(x1 - x0), y: 300, wait: hold, release: 40 });
  return pts;
};
// Where the reader comes to rest: a turn across a section reports the blank page in between and then the
// destination, so wait until relocates stop before reading the last one.
const restingPlace = async (fallback) => {
  let last = messages.filter((m) => m.type === 'relocate').length;
  const until = Date.now() + 4000;
  let quiet = 0;
  while (Date.now() < until && quiet < 700) {
    await settle(100);
    const n = messages.filter((m) => m.type === 'relocate').length;
    if (n === last) quiet += 100;
    else {
      last = n;
      quiet = 0;
    }
  }
  return messages.filter((m) => m.type === 'relocate').at(-1) ?? fallback;
};
// 1. A long drag that slows to a stop before lift-off still turns the page (foliate alone needs half a page).
messages.length = 0;
await swipe(drag(700, 480, 12, 25, 250));
const s1 = await restingPlace(r4);
if (s1.cfi === r4.cfi || !(s1.fraction > r4.fraction)) throw new Error('slow drag did not turn forward');
// 2. A short drag goes back where it was.
messages.length = 0;
await swipe(drag(700, 660, 8, 30, 250));
const s2 = await restingPlace(s1);
if (s2.cfi !== s1.cfi) throw new Error(`short drag turned the page: ${s2.cfi}`);
// 3. A quick flick back returns to the page before.
messages.length = 0;
await swipe(drag(400, 470, 4, 12));
const s3 = await restingPlace(s2);
if (s3.cfi !== r4.cfi) throw new Error(`flick back landed on ${s3.cfi}, expected ${r4.cfi}`);
// 4. A second swipe while the first is still turning is ignored instead of landing on stale offsets: a
// single flick forward must come back to the start page.
messages.length = 0;
await swipe(drag(400, 470, 4, 12));
await settle(50);
await swipe(drag(400, 470, 4, 12));
const s4 = await restingPlace(s3);
if (s4.cfi === r4.cfi) throw new Error('double swipe did not move');
messages.length = 0;
await swipe(drag(700, 600, 4, 12));
const s5 = await restingPlace(s4);
if (s5.cfi !== r4.cfi) throw new Error(`flick forward landed on ${s5.cfi}, expected ${r4.cfi} (was the second swipe applied?)`);
console.log('swipes: slow drag turns, short drag stays, flick back returns, second swipe during a turn ignored');
await settle(300);
frame = liveFrame();
messages.length = 0;

// Simulate a selection inside the rendered chapter and verify we get a CFI back.
// Pick a long text node rather than a <p>: MOBI books often have none.
const selectText = () => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) if (node.textContent.trim().length > 40) break;
  if (!node) {
    // Short pages (a reflowed scan with a few OCR lines per page): any sentence will do.
    const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while ((node = w2.nextNode())) if (node.textContent.trim().length > 10) break;
  }
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
    if (!node) {
      const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while ((node = w2.nextNode())) if (node.textContent.trim().length > 10) break;
    }
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
// The idle drag is a flick, so it turned a page (in a section-per-page book into another frame): go back
// to the selected text and select it again for the steps that follow.
await settle(600);
messages.length = 0;
await send({ type: 'goTo', target: selection.cfi });
await waitFor('relocate', 5000);
await settle(300);
frame = liveFrame();
messages.length = 0;
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

if (loaded.comic) console.log('comic: no text to search');
else {
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
}

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
console.log('reopen at cfi → fraction', r5.fraction.toFixed(3), '(expected ~', r4.fraction.toFixed(3), ')', r5.cfi === r4.cfi ? 'same cfi' : `cfi ${r5.cfi} vs ${r4.cfi}`);
// Reopening switches to scrolled flow, which lays the section out differently; with one section per
// page (PDF) a section is a large share of the book, and sections differ in size, so allow a section
// and a half of drift as long as it is the same section.
const sameSection = r5.cfi?.split('!')[0] === r4.cfi?.split('!')[0];
const drift = Math.abs(r5.fraction - r4.fraction);
if (drift > Math.max(0.02, (sameSection ? 1.5 : 1) / loaded.sections)) throw new Error('did not restore position');

// Books are untrusted: nothing a section carries (script elements, inline handlers, javascript: links)
// may run. reader-web/test/scripted.epub sets a marker through each of those routes.
const scriptRan = await page.evaluate(() =>
  document
    .querySelector('foliate-view')
    ?.renderer?.getContents?.()
    .some((c) => c.doc?.documentElement.hasAttribute('data-script-ran')),
);
if (scriptRan) throw new Error('a script inside the book ran');
console.log('book scripts blocked');

const errors = messages.filter((m) => m.type === 'error');
if (errors.length) console.log('errors:', errors);
await page.screenshot({ path: resolve(process.env.READER_SCREENSHOT || 'reader-test.png') });
await browser.close();
server.close();
console.log(errors.length ? 'DONE WITH ERRORS' : 'OK');
