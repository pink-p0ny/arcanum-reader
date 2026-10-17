// Renders a mock of the Arcanum Cloud paywall as a 1290x2796 PNG for App Store Connect's in-app purchase
// review screenshot. Usage: node scripts/paywall-screenshot.mjs out.png
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const out = resolve(process.argv[2] ?? 'paywall.png');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin:0; width:1290px; height:2796px; background:#000; color:#fff; font:44px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif; }
  .bar { display:flex; justify-content:space-between; align-items:center; padding:120px 64px 40px; }
  .bar b { font-size:56px; }
  .bar span { color:#e8734a; font-weight:600; }
  .p { padding: 0 64px; color:#b0b4ba; line-height:1.4; }
  .p.small { font-size:36px; margin-top:24px; }
  .card { margin:40px 64px 0; background:#212225; border-radius:36px; padding:48px; display:flex; align-items:center; gap:40px; }
  .card .t { flex:1; } .card .t b { display:block; font-size:50px; } .card .t span { color:#b0b4ba; font-size:38px; }
  .card .price { color:#e8734a; font-weight:600; font-size:48px; }
  .legal { display:flex; gap:64px; padding:64px; color:#b0b4ba; font-size:36px; }
  .legal span:first-child { color:#e8734a; font-weight:600; }
  .fine { padding:0 64px; color:#b0b4ba; font-size:30px; line-height:1.4; }
</style></head><body>
  <div class="bar"><b>Arcanum Cloud</b><span>Close</span></div>
  <div class="p">AI read-aloud voices, picks that take your mood into account, and richer book metadata, run on our servers so there is nothing to set up. Stateless by design: nothing about your library is stored.</div>
  <div class="p small">Prefer to run it yourself? The server is open source, and the app also works with your own API key. Both are free; see Settings › AI Services.</div>
  <div class="card"><div class="t"><b>Yearly</b><span>Best value</span></div><div class="price">$19.99 / year</div></div>
  <div class="card"><div class="t"><b>Monthly</b><span>Cancel any time</span></div><div class="price">$2.99 / month</div></div>
  <div class="card"><div class="t"><b>Lifetime</b><span>Pay once, keep it forever</span></div><div class="price">$39.99</div></div>
  <div class="legal"><span>Restore Purchases</span><span>Terms of Use</span><span>Privacy Policy</span></div>
  <div class="fine">Subscriptions renew automatically until cancelled at least 24 hours before the end of the period and are charged to your Apple ID. Lifetime is a one-time purchase.</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1290, height: 2796 } });
await page.setContent(html);
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
