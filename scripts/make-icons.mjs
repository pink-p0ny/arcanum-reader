// Generates every app icon variant from one SVG design (a closed book with a keyhole, "Arcanum").
// Usage: node scripts/make-icons.mjs   (writes into assets/images and assets/expo.icon)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const BG = '#130f26';
const BG_LIGHT = '#2b2256';
const COVER_TOP = '#f2b57f';
const COVER_MID = '#d2703f';
const COVER_BOTTOM = '#a34a28';
const SPINE = '#7d3419';
const GILT = '#f8dcae';
const GLOW = '#a98bff';
const KEYHOLE_STEM = 'M252,324 H322 L349,460 Q349,470 339,470 H235 Q225,470 225,460 Z';

// The book glyph lives in a 500 x 672 box at (0, 0). `mono` draws a flat white silhouette.
function bookGlyph(mono = false) {
  const coverFill = mono ? '#fff' : 'url(#cover)';
  const spineFill = mono ? '#fff' : SPINE;
  const hole = BG;
  return `
    <g id="book" ${mono ? 'mask="url(#keyhole-cut)"' : ''}>
      ${mono ? '' : '<ellipse cx="250" cy="690" rx="230" ry="26" fill="#000" opacity="0.45" filter="url(#blur)"/>'}
      <path d="M30,0 H74 V672 H30 a30,30 0 0 1 -30,-30 V30 a30,30 0 0 1 30,-30 Z" fill="${spineFill}"/>
      <path d="M74,0 H470 a30,30 0 0 1 30,30 V642 a30,30 0 0 1 -30,30 H74 Z" fill="${coverFill}"/>
      ${
        mono
          ? ''
          : `
      <path d="M0,86 H74 M0,586 H74" stroke="${GILT}" stroke-opacity="0.55" stroke-width="6"/>
      <rect x="114" y="40" width="346" height="592" rx="14" fill="none" stroke="${GILT}" stroke-opacity="0.75" stroke-width="6"/>
      <circle cx="287" cy="300" r="120" fill="${GLOW}" opacity="0.35" filter="url(#blur)"/>`
      }
      ${
        mono
          ? ''
          : `<g>
        <circle cx="287" cy="276" r="74" fill="${hole}"/>
        <path d="${KEYHOLE_STEM}" fill="${hole}"/>
        <circle cx="287" cy="276" r="74" fill="url(#inner)"/>
        <path d="${KEYHOLE_STEM}" fill="url(#inner)"/>
      </g>`
      }
    </g>`;
}

const defs = `
  <defs>
    <radialGradient id="bg" cx="50%" cy="36%" r="75%">
      <stop offset="0" stop-color="${BG_LIGHT}"/>
      <stop offset="1" stop-color="${BG}"/>
    </radialGradient>
    <linearGradient id="cover" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COVER_TOP}"/>
      <stop offset="0.5" stop-color="${COVER_MID}"/>
      <stop offset="1" stop-color="${COVER_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="inner" cx="50%" cy="30%" r="70%">
      <stop offset="0" stop-color="${GLOW}" stop-opacity="0.9"/>
      <stop offset="0.6" stop-color="${GLOW}" stop-opacity="0.25"/>
      <stop offset="1" stop-color="${GLOW}" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <mask id="keyhole-cut" maskUnits="userSpaceOnUse" x="-100" y="-100" width="700" height="900">
      <rect x="-100" y="-100" width="700" height="900" fill="#fff"/>
      <circle cx="287" cy="276" r="74" fill="#000"/>
      <path d="${KEYHOLE_STEM}" fill="#000"/>
    </mask>
  </defs>`;

// Full icon: background plus the book centred on a 1024 canvas.
function fullIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${defs}
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <g transform="translate(232 136) scale(1.12)">${bookGlyph()}</g>
  </svg>`;
}

// Book only on a transparent canvas, scaled so its height is `heightPx`, centred in `size`.
function glyphOnly(size, heightPx, mono = false) {
  const s = heightPx / 672;
  const w = 500 * s;
  const x = (size - w) / 2;
  const y = (size - heightPx) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${defs}
    <g transform="translate(${x} ${y}) scale(${s})">${bookGlyph(mono)}</g>
  </svg>`;
}

// Icon Composer layer: the book in its own viewBox with a little breathing room.
function composerLayer() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="760" viewBox="0 0 620 760">
    ${defs}
    <g transform="translate(60 44)">${bookGlyph()}</g>
  </svg>`;
}

async function render(page, svg, size, out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`,
  );
  await page.screenshot({ path: out, omitBackground: true, type: 'png' });
  console.log('wrote', out);
}

const images = resolve('assets/images');
const composer = resolve('assets/expo.icon');

const browser = await chromium.launch();
const page = await browser.newPage();

await render(page, fullIcon(), 1024, resolve(images, 'icon.png'));
await render(page, fullIcon(), 48, resolve(images, 'favicon.png'));
await render(page, glyphOnly(512, 300), 512, resolve(images, 'android-icon-foreground.png'));
await render(
  page,
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${BG}"/></svg>`,
  512,
  resolve(images, 'android-icon-background.png'),
);
await render(page, glyphOnly(432, 250, true), 432, resolve(images, 'android-icon-monochrome.png'));
await render(page, glyphOnly(400, 360), 400, resolve(images, 'splash-icon.png'));
if (process.env.ICON_PREVIEW_DIR) {
  const mono = glyphOnly(432, 250, true).replace(
    '<defs>',
    `<rect width="432" height="432" fill="${BG}"/><defs>`,
  );
  await render(page, mono, 432, resolve(process.env.ICON_PREVIEW_DIR, 'mono-preview.png'));
}

await browser.close();

// Icon Composer document for iOS 26 layered icons. Same schema as the Expo template's bundle.
rmSync(resolve(composer, 'Assets'), { recursive: true, force: true });
mkdirSync(resolve(composer, 'Assets'), { recursive: true });
writeFileSync(resolve(composer, 'Assets', 'arcanum-book.svg'), composerLayer());
writeFileSync(
  resolve(composer, 'icon.json'),
  JSON.stringify(
    {
      fill: { solid: 'extended-srgb:0.07451,0.05882,0.14902,1.00000' },
      groups: [
        {
          layers: [{ 'image-name': 'arcanum-book.svg', name: 'arcanum-book', position: { scale: 0.82 } }],
          shadow: { kind: 'neutral', opacity: 0.5 },
          translucency: { enabled: false, value: 0.5 },
        },
      ],
      'supported-platforms': { circles: ['watchOS'], squares: 'shared' },
    },
    null,
    2,
  ) + '\n',
);
console.log('wrote', resolve(composer, 'icon.json'));
