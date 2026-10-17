// Bridge between the React Native side and foliate-js, the same engine Grimmory's web reader uses,
// so CFIs for progress and highlights stay compatible with the server and the web UI.
import '../foliate/view.js';
import { Overlayer } from '../foliate/overlayer.js';

const post = (msg) => {
  const bridge = window.ReactNativeWebView;
  if (bridge) bridge.postMessage(JSON.stringify(msg));
  else console.log('[reader]', msg);
};

const status = (text) => {
  const el = document.getElementById('status');
  if (el) el.textContent = text ?? '';
};

let view = null;
let settings = null;
/** cfi -> { color, style } for drawing. */
const annotationStyles = new Map();
const drawnAnnotations = new Set();
let annotationTapped = false;
let selectionTimer = null;
let currentTocLabel = '';
/** CFI of the sentence currently being read aloud (drawn as a soft highlight). */
let ttsCfi = null;

// ---------- loading ----------

function loadBytes(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onload = () => {
      if ((xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.response))
        resolve(xhr.response);
      else reject(new Error(`Could not read book file (status ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Could not read book file'));
    xhr.send();
  });
}

async function open({ url, name, position, settings: s, annotations }) {
  try {
    settings = s;
    applyHostColors(s);
    status('Opening…');
    const blob = await loadBytes(url);
    const file = new File([blob], name || 'book.epub', { type: 'application/epub+zip' });

    if (view) view.remove();
    view = document.createElement('foliate-view');
    document.body.append(view);
    wireView(view);

    await view.open(file);
    applyRendererSettings(s);

    for (const a of annotations ?? []) annotationStyles.set(a.cfi, { color: a.color, style: a.style });

    const { book } = view;
    post({
      type: 'loaded',
      title: book.metadata?.title ?? '',
      toc: serializeToc(book.toc ?? []),
      sections: book.sections?.length ?? 0,
    });

    if (position?.cfi) await view.init({ lastLocation: position.cfi });
    else if (position?.fraction > 0) {
      await view.init({ showTextStart: true });
      await view.goToFraction(position.fraction);
    } else await view.init({ showTextStart: true });

    for (const a of annotations ?? []) view.addAnnotation({ value: a.cfi }).catch(() => {});
    status('');
  } catch (e) {
    status('');
    post({ type: 'error', message: e?.message ?? String(e), stack: e?.stack });
  }
}

function serializeToc(items, depth = 0) {
  if (!items || depth > 6) return [];
  return items.map((it) => ({
    label: (it.label ?? '').trim(),
    href: it.href ?? null,
    children: serializeToc(it.subitems, depth + 1),
  }));
}

// ---------- events from foliate ----------

function wireView(v) {
  v.addEventListener('relocate', (e) => {
    const d = e.detail ?? {};
    if (d.tocItem?.label) currentTocLabel = d.tocItem.label;
    post({
      type: 'relocate',
      cfi: d.cfi ?? null,
      fraction: Number.isFinite(d.fraction) ? d.fraction : 0,
      href: d.tocItem?.href ?? d.pageItem?.href ?? null,
      tocLabel: d.tocItem?.label ?? null,
      section: d.section ?? null,
      location: d.location ?? null,
      time: d.time ?? null,
    });
  });

  v.addEventListener('load', (e) => {
    const { doc, index } = e.detail;
    applyDocStyles(doc);
    doc.addEventListener('selectionchange', () => scheduleSelection(doc, index));
    wireTaps(doc);
  });

  v.addEventListener('draw-annotation', (e) => {
    const { draw, annotation } = e.detail;
    if (annotation.value === ttsCfi) {
      draw(Overlayer.highlight, { color: settings?.dark ? '#3b82f6' : '#93c5fd' });
      return;
    }
    const st = annotationStyles.get(annotation.value) ?? { color: '#FACC15', style: 'highlight' };
    const fn = Overlayer[st.style] ?? Overlayer.highlight;
    draw(fn, { color: st.color ?? '#FACC15' });
    drawnAnnotations.add(annotation.value);
  });

  v.addEventListener('show-annotation', (e) => {
    const { value, range } = e.detail;
    if (value === ttsCfi) return; // the read-aloud highlight is not a user annotation
    annotationTapped = true;
    setTimeout(() => (annotationTapped = false), 300);
    post({ type: 'annotationTap', cfi: value, rect: rectFor(range) });
  });

  v.addEventListener('external-link', (e) => {
    e.preventDefault();
    post({ type: 'externalLink', href: e.detail.href });
  });
}

// iOS WebKit only synthesises `click` from a tap when the target looks interactive, so a delegated click
// listener can stay silent for taps on plain paragraphs. Listen to the touch itself as well and let
// whichever arrives first handle the tap; the other one is dropped.
let lastNativeClick = 0;

function wireTaps(doc) {
  // While text is selected, keep foliate's swipe handler away from the touch so iOS can drag the selection
  // handles: foliate otherwise preventDefaults every touchmove and scrolls the page under the finger.
  const hasSelection = () => {
    const sel = doc.getSelection();
    return !!sel && !sel.isCollapsed && !!sel.toString().trim();
  };
  let selecting = false;
  const guard = { capture: true, passive: true };
  doc.addEventListener(
    'touchstart',
    (ev) => {
      selecting = hasSelection();
      if (selecting) ev.stopPropagation();
    },
    guard,
  );
  doc.addEventListener(
    'touchmove',
    (ev) => {
      if (!selecting && hasSelection()) selecting = true; // long-press then drag to extend
      if (selecting) ev.stopPropagation();
    },
    guard,
  );
  doc.addEventListener(
    'touchend',
    (ev) => {
      if (selecting) ev.stopPropagation();
      selecting = false;
    },
    guard,
  );
  doc.addEventListener('touchcancel', () => (selecting = false), guard);

  let start = null;
  doc.addEventListener(
    'click',
    (ev) => {
      lastNativeClick = Date.now();
      handleTap(doc, ev.clientX, ev.clientY, ev.target);
    },
    true,
  );
  doc.addEventListener(
    'touchstart',
    (ev) => {
      const t = ev.touches[0];
      start = ev.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
    },
    { passive: true },
  );
  doc.addEventListener('touchcancel', () => (start = null), { passive: true });
  doc.addEventListener(
    'touchend',
    (ev) => {
      const s = start;
      start = null;
      const t = ev.changedTouches[0];
      if (!s || !t || ev.touches.length > 0) return;
      if (Math.hypot(t.clientX - s.x, t.clientY - s.y) > 12 || Date.now() - s.at > 450) return;
      const { target } = ev;
      setTimeout(() => {
        if (lastNativeClick >= s.at) return; // the browser delivered a click for this tap
        const a = target?.closest?.('a[href]');
        if (a)
          a.click(); // foliate's link handler listens for click
        else handleTap(doc, t.clientX, t.clientY, target);
      }, 150);
    },
    { passive: true },
  );
}

function handleTap(doc, clientX, clientY, target) {
  if (target?.closest?.('a[href]')) return;
  const sel = doc.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim()) return;
  // Let foliate's own click listener run first; it fires show-annotation synchronously.
  setTimeout(() => {
    if (annotationTapped) return;
    const overlayer = view?.renderer?.getContents?.().find((c) => c.doc === doc)?.overlayer;
    const [value, range] = overlayer?.hitTest({ x: clientX, y: clientY }) ?? [];
    if (value && value !== ttsCfi) {
      post({ type: 'annotationTap', cfi: value, rect: rectFor(range) });
      return;
    }
    const frame = doc.defaultView?.frameElement;
    const fr = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
    post({
      type: 'tap',
      x: (fr.left + clientX) / window.innerWidth,
      y: (fr.top + clientY) / window.innerHeight,
    });
  }, 0);
}

function rectFor(range) {
  try {
    const r = range.getBoundingClientRect();
    const frame = range.startContainer.ownerDocument.defaultView?.frameElement;
    const fr = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: fr.left + r.left, y: fr.top + r.top, width: r.width, height: r.height };
  } catch {
    return null;
  }
}

function scheduleSelection(doc, index) {
  clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => {
    const sel = doc.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      post({ type: 'deselect' });
      return;
    }
    const range = sel.getRangeAt(0);
    const text = range.toString().trim();
    if (!text) {
      post({ type: 'deselect' });
      return;
    }
    const cfi = view?.getCFI(index, range);
    if (!cfi) return;
    post({ type: 'selection', cfi, text, rect: rectFor(range), chapter: currentTocLabel });
  }, 120);
}

// ---------- settings ----------

function applyHostColors(s) {
  document.documentElement.style.setProperty('--bg', s.colors.bg);
  document.documentElement.style.setProperty('--fg', s.colors.fg);
  document.body.style.background = s.colors.bg;
}

function applyRendererSettings(s) {
  const r = view?.renderer;
  if (!r) return;
  r.setAttribute('flow', s.flow);
  r.setAttribute('gap', `${s.sideMargin}%`);
  r.setAttribute('margin', `${s.verticalMargin}px`);
  r.setAttribute('max-inline-size', `${s.maxInlineSize}px`);
  r.setAttribute('max-column-count', String(s.maxColumns));
  if (s.flow === 'paginated') r.setAttribute('animated', 'true');
  else r.removeAttribute('animated');
  r.setStyles?.(buildCss(s));
}

function applyDocStyles() {
  // foliate re-applies setStyles for each loaded doc; nothing extra needed here yet.
}

function buildCss(s) {
  const { bg, fg, link } = s.colors;
  const fontRule = s.fontFamily
    ? `body { font-family: ${s.fontFamily} !important; } body * { font-family: inherit !important; }`
    : '';
  const forceColors = s.forceColors
    ? `
      html, body { color: ${fg} !important; background: none !important; }
      body * { color: inherit !important; border-color: currentColor !important; background-color: ${bg} !important; }
      a:any-link { color: ${link} !important; }
      svg, img { background-color: transparent !important; ${s.dark ? '' : 'mix-blend-mode: multiply;'} }`
    : '';
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    @media screen {
      html { color-scheme: ${s.dark ? 'dark' : 'light'}; color: ${fg}; font-size: ${s.fontSize}px; }
      ${fontRule}
      a:any-link { color: ${link}; text-underline-offset: .1em; }
      aside[epub|type~="footnote"] { display: none; }
      ${forceColors}
    }
    html { line-height: ${s.lineHeight}; hanging-punctuation: allow-end last; orphans: 2; widows: 2; }
    [align="left"] { text-align: left; } [align="right"] { text-align: right; }
    [align="center"] { text-align: center; } [align="justify"] { text-align: justify; }
    h1, h2, h3, h4, h5, h6, hgroup, th { text-wrap: balance; }
    pre { white-space: pre-wrap !important; tab-size: 2; }
    p, li, blockquote, dd { line-height: ${s.lineHeight}; text-align: ${s.justify ? 'justify' : 'start'} !important; hyphens: ${s.hyphenate ? 'auto' : 'none'}; }
    ::selection { background-color: rgba(10, 132, 255, .3); }
  `;
}

// ---------- read aloud ----------
// foliate's TTS walks the chapter block by block and emits SSML with <mark> tags between sentences.
// The native side speaks each sentence and tells us which mark it is on so we can highlight it.

function ttsHighlight(range) {
  try {
    const { index } = view.renderer.getContents()[0];
    const cfi = view.getCFI(index, range);
    ttsClearHighlight();
    ttsCfi = cfi;
    view.addAnnotation({ value: cfi }).catch(() => {});
    view.renderer.scrollToAnchor(range, false);
  } catch (e) {
    post({ type: 'error', message: `tts highlight: ${e?.message ?? e}` });
  }
}

function ttsClearHighlight() {
  if (ttsCfi) {
    const old = ttsCfi;
    ttsCfi = null;
    view?.deleteAnnotation({ value: old }).catch(() => {});
  }
}

async function ttsInit() {
  view.tts = null;
  await view.initTTS('sentence', ttsHighlight);
}

function ttsSentences(ssml) {
  if (!ssml) return [];
  const doc = new DOMParser().parseFromString(ssml, 'application/xml');
  const out = [];
  let current = null;
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 1 && child.localName === 'mark') {
        current = { mark: child.getAttribute('name'), text: '' };
        out.push(current);
      } else if (child.nodeType === 3) {
        if (!current) {
          current = { mark: null, text: '' };
          out.push(current);
        }
        current.text += child.nodeValue;
      } else if (child.nodeType === 1) walk(child);
    }
  };
  walk(doc.documentElement);
  return out
    .map((s) => ({ mark: s.mark, text: s.text.replace(/\s+/g, ' ').trim() }))
    .filter((s) => s.text.length > 0);
}

async function ttsEmit(ssml, hops = 0) {
  const sentences = ttsSentences(ssml);
  if (sentences.length === 0) {
    if (hops > 40) return post({ type: 'ttsEnd' });
    return ttsAdvance(hops + 1);
  }
  post({ type: 'ttsBlock', sentences });
}

async function ttsAdvance(hops = 0) {
  let ssml = view.tts?.next();
  if (!ssml) {
    const { index } = view.renderer.getContents()[0];
    if (index + 1 >= view.book.sections.length) return post({ type: 'ttsEnd' });
    await view.goTo(index + 1);
    await ttsInit();
    ssml = view.tts.start();
  }
  return ttsEmit(ssml, hops);
}

const ttsHandlers = {
  ttsStart: async () => {
    try {
      await ttsInit();
      const range = view.lastLocation?.range;
      const ssml = range ? view.tts.from(range) : view.tts.start();
      await ttsEmit(ssml);
    } catch (e) {
      post({ type: 'error', message: `Read aloud failed: ${e?.message ?? e}` });
    }
  },
  ttsNext: () =>
    ttsAdvance().catch((e) => post({ type: 'error', message: `Read aloud failed: ${e?.message ?? e}` })),
  ttsPrev: async () => {
    const ssml = view.tts?.prev();
    if (!ssml) return ttsHandlers.ttsStart();
    return ttsEmit(ssml);
  },
  ttsMark: ({ mark }) => {
    if (mark) view.tts?.setMark(mark);
  },
  ttsStop: () => ttsClearHighlight(),
};

// ---------- commands from React Native ----------

const handlers = {
  open,
  settings: ({ settings: s }) => {
    settings = s;
    applyHostColors(s);
    applyRendererSettings(s);
  },
  next: () => view?.next(),
  prev: () => view?.prev(),
  goTo: ({ target }) => view?.goTo(target).catch((e) => post({ type: 'error', message: e.message })),
  goToFraction: ({ fraction }) => view?.goToFraction(fraction),
  deselect: () => view?.deselect(),
  addAnnotation: ({ cfi, color, style }) => {
    annotationStyles.set(cfi, { color, style });
    view
      ?.addAnnotation({ value: cfi })
      .then((res) =>
        post({ type: 'annotationAdded', cfi, label: res?.label ?? null, drawn: drawnAnnotations.has(cfi) }),
      )
      .catch((e) => post({ type: 'error', message: `Could not place highlight: ${e?.message ?? e}` }));
  },
  updateAnnotation: ({ cfi, color, style }) => {
    annotationStyles.set(cfi, { color, style });
    view?.addAnnotation({ value: cfi }).catch(() => {});
  },
  removeAnnotation: ({ cfi }) => {
    annotationStyles.delete(cfi);
    drawnAnnotations.delete(cfi);
    view?.deleteAnnotation({ value: cfi }).catch(() => {});
  },
  showAnnotation: ({ cfi }) => view?.showAnnotation({ value: cfi }).catch(() => {}),
};

function onMessage(e) {
  let msg;
  try {
    msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
  } catch {
    return;
  }
  const h = msg && (handlers[msg.type] ?? ttsHandlers[msg.type]);
  if (h) h(msg);
}
window.addEventListener('message', onMessage);
document.addEventListener('message', onMessage);

window.addEventListener('error', (e) => post({ type: 'error', message: e.message }));
window.addEventListener('unhandledrejection', (e) =>
  post({ type: 'error', message: e.reason?.message ?? String(e.reason) }),
);

post({ type: 'ready' });
