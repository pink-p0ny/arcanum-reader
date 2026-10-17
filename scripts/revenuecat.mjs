// RevenueCat v2 API chores. The secret key is read from the file named by RC_KEY_FILE (never from the
// repo). Usage: RC_KEY_FILE=... node scripts/revenuecat.mjs <command>
import { readFileSync } from 'node:fs';

const PROJECT = process.env.RC_PROJECT ?? 'projc5358664';
const BUNDLE_ID = 'net.snobunny.arcanum';
const key = readFileSync(process.env.RC_KEY_FILE, 'utf8').trim();

async function rc(method, path, body) {
  const res = await fetch(`https://api.revenuecat.com/v2/projects/${PROJECT}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json?.message ?? JSON.stringify(json)}`);
  return json;
}
const items = async (path) =>
  (await rc('GET', `${path}${path.includes('?') ? '&' : '?'}limit=100`)).items ?? [];

const PRODUCTS = [
  {
    store: 'net.snobunny.arcanum.premium.monthly',
    type: 'subscription',
    name: 'Arcanum Cloud Monthly',
    pkg: '$rc_monthly',
    pkgName: 'Monthly',
  },
  {
    store: 'net.snobunny.arcanum.premium.yearly',
    type: 'subscription',
    name: 'Arcanum Cloud Yearly',
    pkg: '$rc_annual',
    pkgName: 'Yearly',
  },
  {
    store: 'net.snobunny.arcanum.premium.lifetime',
    type: 'one_time',
    name: 'Arcanum Cloud Lifetime',
    pkg: '$rc_lifetime',
    pkgName: 'Lifetime',
  },
];

const commands = {
  async inspect() {
    for (const a of await items('/apps'))
      console.log('app', a.id, a.name, a.type, JSON.stringify(a.app_store ?? a[a.type] ?? {}));
    for (const p of await items('/products'))
      console.log('product', p.id, p.store_identifier, p.type, p.app_id);
    for (const e of await items('/entitlements'))
      console.log('entitlement', e.id, e.lookup_key, e.display_name);
    for (const o of await items('/offerings')) {
      console.log('offering', o.id, o.lookup_key, o.is_current ? '(current)' : '');
      for (const pk of await items(`/offerings/${o.id}/packages`))
        console.log('  package', pk.id, pk.lookup_key, pk.display_name);
    }
  },

  /** Creates (or reuses) the App Store app, products, entitlement, offering and packages, and wires them. */
  async setup() {
    let app = (await items('/apps')).find(
      (a) => a.type === 'app_store' && a.app_store?.bundle_id === BUNDLE_ID,
    );
    if (!app) {
      app = await rc('POST', '/apps', {
        name: 'Arcanum iOS',
        type: 'app_store',
        app_store: { bundle_id: BUNDLE_ID },
      });
      console.log('created app', app.id);
    } else console.log('app exists', app.id);

    const existingProducts = await items('/products');
    const products = {};
    for (const p of PRODUCTS) {
      let prod = existingProducts.find((x) => x.store_identifier === p.store && x.app_id === app.id);
      if (!prod) {
        prod = await rc('POST', '/products', {
          store_identifier: p.store,
          app_id: app.id,
          type: p.type,
          display_name: p.name,
        });
        console.log('created product', p.store, prod.id);
      } else console.log('product exists', p.store, prod.id);
      products[p.store] = prod;
    }

    let ent = (await items('/entitlements')).find((e) => e.lookup_key === 'premium');
    if (!ent) {
      ent = await rc('POST', '/entitlements', { lookup_key: 'premium', display_name: 'Arcanum Cloud' });
      console.log('created entitlement', ent.id);
    } else console.log('entitlement exists', ent.id);
    const attached = new Set(((await items(`/entitlements/${ent.id}/products`)) ?? []).map((p) => p.id));
    const toAttach = Object.values(products)
      .map((p) => p.id)
      .filter((id) => !attached.has(id));
    if (toAttach.length) {
      await rc('POST', `/entitlements/${ent.id}/actions/attach_products`, { product_ids: toAttach });
      console.log('attached', toAttach.length, 'products to premium');
    }

    let off = (await items('/offerings')).find((o) => o.lookup_key === 'default');
    if (!off) {
      off = await rc('POST', '/offerings', { lookup_key: 'default', display_name: 'Arcanum Cloud' });
      console.log('created offering', off.id);
    } else console.log('offering exists', off.id);
    if (!off.is_current) {
      await rc('POST', `/offerings/${off.id}`, { is_current: true }).catch(async () =>
        rc('PATCH', `/offerings/${off.id}`, { is_current: true }),
      );
      console.log('made offering current');
    }
    const packages = await items(`/offerings/${off.id}/packages`);
    for (const p of PRODUCTS) {
      let pkg = packages.find((x) => x.lookup_key === p.pkg);
      if (!pkg) {
        pkg = await rc('POST', `/offerings/${off.id}/packages`, {
          lookup_key: p.pkg,
          display_name: p.pkgName,
        });
        console.log('created package', p.pkg, pkg.id);
      }
      const inPkg = new Set(
        ((await items(`/packages/${pkg.id}/products`)) ?? []).map((x) => x.id ?? x.product?.id),
      );
      if (!inPkg.has(products[p.store].id)) {
        await rc('POST', `/packages/${pkg.id}/actions/attach_products`, {
          products: [{ product_id: products[p.store].id, eligibility_criteria: 'all' }],
        });
        console.log('attached', p.store, 'to', p.pkg);
      }
    }

    const keys = await items(`/apps/${app.id}/public_api_keys`).catch(
      (e) => (console.log('public keys:', e.message), []),
    );
    for (const k of keys) console.log('public key', k.key_type ?? '', k.key);
    console.log('done');
  },

  /**
   * Uploads the App Store Connect team key and the In-App Purchase (subscription) key to the App Store app.
   * Reads both .p8 files and the issuer id from ~/.appstoreconnect/private_keys. Field names were found by
   * probing: the IAP key content goes in `subscription_private_key`, the team key in `app_store_connect_api_key`.
   */
  async credentials() {
    const { homedir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = join(homedir(), '.appstoreconnect', 'private_keys');
    const ascKeyId = process.env.ASC_KEY_ID ?? '34NTB4V9VM';
    const iapKeyId = process.env.IAP_KEY_ID ?? 'KAYP8WK639';
    const issuer = readFileSync(join(dir, `issuer_${ascKeyId}.txt`), 'utf8').trim();
    const app = (await items('/apps')).find(
      (a) => a.type === 'app_store' && a.app_store?.bundle_id === BUNDLE_ID,
    );
    if (!app) throw new Error('App Store app not found; run setup first');
    const updated = await rc('POST', `/apps/${app.id}`, {
      app_store: {
        app_store_connect_api_key: readFileSync(join(dir, `AuthKey_${ascKeyId}.p8`), 'utf8'),
        app_store_connect_api_key_id: ascKeyId,
        app_store_connect_api_key_issuer: issuer,
        subscription_private_key: readFileSync(join(dir, `SubscriptionKey_${iapKeyId}.p8`), 'utf8'),
        subscription_key_id: iapKeyId,
        subscription_key_issuer: issuer,
      },
    });
    console.log(
      'asc key configured:',
      updated.app_store.app_store_connect_api_key_configured,
      '| iap key configured:',
      updated.app_store.subscription_key_configured,
    );
  },

  async app() {
    const app = (await items('/apps')).find((a) => a.type === 'app_store');
    console.log(JSON.stringify(app, null, 2));
  },
};

const [cmd] = process.argv.slice(2);
if (!commands[cmd]) {
  console.error(`commands: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
commands[cmd]().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
