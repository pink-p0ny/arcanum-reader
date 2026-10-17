// App Store Connect API client and the chores we automate with it. No dependencies: the JWT is signed with
// Node's crypto. Credentials live outside the repo in ~/.appstoreconnect/private_keys/ (AuthKey_<KEY>.p8
// and issuer_<KEY>.txt). Usage: node scripts/asc.mjs <command> [args]
import { createSign, sign as cryptoSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const KEY_ID = process.env.ASC_KEY_ID ?? '34NTB4V9VM';
const DIR = join(homedir(), '.appstoreconnect', 'private_keys');
const BUNDLE_ID = 'net.snobunny.arcanum';
const BASE = 'https://api.appstoreconnect.apple.com';

function token() {
  const key = readFileSync(join(DIR, `AuthKey_${KEY_ID}.p8`), 'utf8');
  const iss = readFileSync(join(DIR, `issuer_${KEY_ID}.txt`), 'utf8').trim();
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${b64({ iss, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
  const sig = cryptoSign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  void createSign;
  return `${unsigned}.${sig.toString('base64url')}`;
}

export async function api(method, path, body) {
  const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const errs = (json?.errors ?? [])
      .map((e) => `${e.code ?? e.status}: ${e.title} — ${e.detail ?? ''}`)
      .join('\n');
    throw new Error(`${method} ${path} → ${res.status}\n${errs || text}`);
  }
  return json;
}

/** Follows `links.next` and returns every item. */
export async function all(path) {
  const out = [];
  let next = path;
  while (next) {
    const page = await api('GET', next);
    out.push(...page.data);
    next = page.links?.next ?? null;
  }
  return out;
}

const rel = (type, id) => ({ data: { type, id } });

export async function appId() {
  const res = await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`);
  if (!res.data.length) throw new Error(`No app with bundle id ${BUNDLE_ID}`);
  return res.data[0].id;
}

// ---------- commands ----------

const commands = {
  async whoami() {
    const apps = await api('GET', '/v1/apps?fields[apps]=name,bundleId,sku');
    for (const a of apps.data) console.log(a.id, a.attributes.bundleId, a.attributes.name);
  },

  /** Everything purchasable on the app, with what each is still missing. */
  async inspect() {
    const app = await appId();
    for (const g of await all(`/v1/apps/${app}/subscriptionGroups`)) {
      const locs = await all(`/v1/subscriptionGroups/${g.id}/subscriptionGroupLocalizations`);
      console.log(
        `group ${g.id} "${g.attributes.referenceName}" localizations: ${locs.map((l) => l.attributes.name).join(', ') || 'none'}`,
      );
      for (const s of await all(`/v1/subscriptionGroups/${g.id}/subscriptions`)) {
        const a = s.attributes;
        const sl = await all(`/v1/subscriptions/${s.id}/subscriptionLocalizations`);
        const prices = await all(
          `/v1/subscriptions/${s.id}/prices?filter[territory]=USA&include=subscriptionPricePoint`,
        );
        const avail = await api('GET', `/v1/subscriptions/${s.id}/subscriptionAvailability`).catch(
          () => null,
        );
        console.log(
          `  sub ${s.id} ${a.productId} "${a.name}" ${a.subscriptionPeriod} level ${a.groupLevel} state ${a.state}`,
        );
        console.log(
          `    localizations: ${sl.map((l) => `${l.attributes.locale}:"${l.attributes.name}"/"${l.attributes.description}"`).join(', ') || 'none'}`,
        );
        console.log(`    USA prices: ${prices.length} | availability: ${avail ? 'set' : 'none'}`);
      }
    }
    for (const i of await all(`/v1/apps/${app}/inAppPurchasesV2`)) {
      const a = i.attributes;
      const il = await all(`/v2/inAppPurchases/${i.id}/inAppPurchaseLocalizations`);
      const sched = await api('GET', `/v2/inAppPurchases/${i.id}/priceSchedule`).catch(() => null);
      const avail = await api('GET', `/v2/inAppPurchases/${i.id}/inAppPurchaseAvailability`).catch(
        () => null,
      );
      console.log(`iap ${i.id} ${a.productId} "${a.name}" ${a.inAppPurchaseType} state ${a.state}`);
      console.log(
        `  localizations: ${il.map((l) => `${l.attributes.locale}:"${l.attributes.name}"/"${l.attributes.description}"`).join(', ') || 'none'} | price schedule: ${sched?.data ? 'set' : 'none'} | availability: ${avail?.data ? 'set' : 'none'}`,
      );
    }
  },

  async pricepoints(subId, price = '19.99') {
    const page = await api(
      'GET',
      `/v1/subscriptions/${subId}/pricePoints?filter[territory]=USA&limit=200&include=territory`,
    );
    console.log('returned', page.data.length, 'of', page.meta?.paging?.total, 'next:', !!page.links?.next);
    for (const p of page.data.filter((x) => x.attributes.customerPrice === price).slice(0, 3))
      console.log(p.id.slice(0, 40), p.attributes, p.relationships?.territory?.data);
    const sample = page.data[0];
    if (sample) console.log('sample', sample.attributes, sample.relationships?.territory?.data);
  },

  async subprices(subId) {
    const prices = await all(`/v1/subscriptions/${subId}/prices?include=subscriptionPricePoint,territory`);
    for (const p of prices) console.log(p.id, p.attributes, JSON.stringify(p.relationships));
  },

  async iapprice(iapId) {
    const sched = await api(
      'GET',
      `/v2/inAppPurchases/${iapId}/iapPriceSchedule?include=baseTerritory`,
    ).catch((e) => ({ error: e.message }));
    console.log(JSON.stringify(sched).slice(0, 400));
    if (sched?.data) {
      const prices = await all(
        `/v1/inAppPurchasePriceSchedules/${sched.data.id}/manualPrices?include=inAppPurchasePricePoint,territory`,
      );
      for (const p of prices.slice(0, 3))
        console.log(p.attributes, JSON.stringify(p.relationships?.territory?.data));
    }
  },

  /** Uploads one PNG as the App Review screenshot of every Arcanum Cloud product that lacks one. */
  async screenshots(file) {
    const { readFileSync } = await import('node:fs');
    const { createHash } = await import('node:crypto');
    const { basename } = await import('node:path');
    const bytes = readFileSync(file);
    const md5 = createHash('md5').update(bytes).digest('hex');
    const app = await appId();

    const upload = async (createPath, type, relName, relType, id) => {
      const created = (
        await api('POST', createPath, {
          data: {
            type,
            attributes: { fileName: basename(file), fileSize: bytes.length },
            relationships: { [relName]: rel(relType, id) },
          },
        })
      ).data;
      for (const op of created.attributes.uploadOperations ?? []) {
        const chunk = bytes.subarray(op.offset, op.offset + op.length);
        const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
        const r = await fetch(op.url, { method: op.method, headers, body: chunk });
        if (!r.ok) throw new Error(`upload chunk failed: ${r.status}`);
      }
      await api('PATCH', `${createPath}/${created.id}`, {
        data: { type, id: created.id, attributes: { uploaded: true, sourceFileChecksum: md5 } },
      });
      return created.id;
    };

    for (const g of await all(`/v1/apps/${app}/subscriptionGroups`)) {
      for (const s of await all(`/v1/subscriptionGroups/${g.id}/subscriptions`)) {
        const has = await api('GET', `/v1/subscriptions/${s.id}/appStoreReviewScreenshot`).catch(() => null);
        if (has?.data) {
          console.log('has screenshot', s.attributes.productId);
          continue;
        }
        const id = await upload(
          '/v1/subscriptionAppStoreReviewScreenshots',
          'subscriptionAppStoreReviewScreenshots',
          'subscription',
          'subscriptions',
          s.id,
        );
        console.log('uploaded screenshot for', s.attributes.productId, id);
      }
    }
    for (const i of await all(`/v1/apps/${app}/inAppPurchasesV2`)) {
      const has = await api('GET', `/v2/inAppPurchases/${i.id}/appStoreReviewScreenshot`).catch(() => null);
      if (has?.data) {
        console.log('has screenshot', i.attributes.productId);
        continue;
      }
      const id = await upload(
        '/v1/inAppPurchaseAppStoreReviewScreenshots',
        'inAppPurchaseAppStoreReviewScreenshots',
        'inAppPurchaseV2',
        'inAppPurchases',
        i.id,
      );
      console.log('uploaded screenshot for', i.attributes.productId, id);
    }
  },

  async territories() {
    const t = await all('/v1/territories?limit=200');
    console.log(t.length, 'territories');
  },

  /** Creates the Arcanum Cloud subscription group, two subscriptions and the lifetime product with prices. */
  async products() {
    const app = await appId();
    const territories = (await all('/v1/territories?limit=200')).map((t) => t.id);
    const USD = (points, price) => {
      const p = points.find((x) => x.attributes.customerPrice === price);
      if (!p)
        throw new Error(
          `No USA price point for ${price}; candidates: ${points.slice(0, 5).map((x) => x.attributes.customerPrice)}`,
        );
      return p.id;
    };

    // Subscription group: reuse the one made by hand ("Arcanum Premium") or ours; drop an empty duplicate.
    const groups = await all(`/v1/apps/${app}/subscriptionGroups`);
    let group =
      groups.find((g) => g.attributes.referenceName === 'Arcanum Premium') ??
      groups.find((g) => g.attributes.referenceName === 'Arcanum Cloud');
    for (const g of groups) {
      if (g.id === group?.id) continue;
      const members = await all(`/v1/subscriptionGroups/${g.id}/subscriptions`);
      if (members.length === 0) {
        await api('DELETE', `/v1/subscriptionGroups/${g.id}`);
        console.log('deleted empty group', g.id, g.attributes.referenceName);
      }
    }
    if (group) {
      const locs = await all(`/v1/subscriptionGroups/${group.id}/subscriptionGroupLocalizations`);
      if (!locs.length) {
        await api('POST', '/v1/subscriptionGroupLocalizations', {
          data: {
            type: 'subscriptionGroupLocalizations',
            attributes: { name: 'Arcanum Cloud', locale: 'en-US' },
            relationships: { subscriptionGroup: rel('subscriptionGroups', group.id) },
          },
        });
        console.log('added group display name to', group.id);
      }
    }
    if (!group) {
      group = (
        await api('POST', '/v1/subscriptionGroups', {
          data: {
            type: 'subscriptionGroups',
            attributes: { referenceName: 'Arcanum Cloud' },
            relationships: { app: rel('apps', app) },
          },
        })
      ).data;
      await api('POST', '/v1/subscriptionGroupLocalizations', {
        data: {
          type: 'subscriptionGroupLocalizations',
          attributes: { name: 'Arcanum Cloud', locale: 'en-US' },
          relationships: { subscriptionGroup: rel('subscriptionGroups', group.id) },
        },
      });
      console.log('created group', group.id);
    } else console.log('group exists', group.id);

    const existing = await all(`/v1/subscriptionGroups/${group.id}/subscriptions`);
    const subs = [
      {
        name: 'Arcanum Cloud Monthly',
        productId: 'net.snobunny.arcanum.premium.monthly',
        period: 'ONE_MONTH',
        price: '2.99',
        desc: 'AI voices, picks and metadata, monthly',
      },
      {
        name: 'Arcanum Cloud Yearly',
        productId: 'net.snobunny.arcanum.premium.yearly',
        period: 'ONE_YEAR',
        price: '19.99',
        desc: 'AI voices, picks and metadata, all year',
      },
    ];
    for (const s of subs) {
      let sub = existing.find((x) => x.attributes.productId === s.productId);
      if (!sub) {
        sub = (
          await api('POST', '/v1/subscriptions', {
            data: {
              type: 'subscriptions',
              attributes: {
                name: s.name,
                productId: s.productId,
                subscriptionPeriod: s.period,
                groupLevel: 1,
                familySharable: false,
                reviewNote: 'Unlocks Arcanum Cloud under Settings › AI Services.',
              },
              relationships: { group: rel('subscriptionGroups', group.id) },
            },
          })
        ).data;
        console.log('created subscription', s.productId, sub.id);
      } else console.log('subscription exists', s.productId, sub.id);

      // Repair whatever is missing: localization, USA price, availability.
      const locs = await all(`/v1/subscriptions/${sub.id}/subscriptionLocalizations`);
      if (!locs.some((l) => l.attributes.locale === 'en-US')) {
        await api('POST', '/v1/subscriptionLocalizations', {
          data: {
            type: 'subscriptionLocalizations',
            attributes: { name: s.name, description: s.desc, locale: 'en-US' },
            relationships: { subscription: rel('subscriptions', sub.id) },
          },
        });
        console.log('  added localization');
      }
      const avail = await api('GET', `/v1/subscriptions/${sub.id}/subscriptionAvailability`).catch(
        () => null,
      );
      if (!avail?.data) {
        await api('POST', '/v1/subscriptionAvailabilities', {
          data: {
            type: 'subscriptionAvailabilities',
            attributes: { availableInNewTerritories: true },
            relationships: {
              subscription: rel('subscriptions', sub.id),
              availableTerritories: { data: territories.map((id) => ({ type: 'territories', id })) },
            },
          },
        });
        console.log('  set availability everywhere');
      }
      const prices = await all(`/v1/subscriptions/${sub.id}/prices?filter[territory]=USA`);
      if (!prices.length) {
        const points = await all(`/v1/subscriptions/${sub.id}/pricePoints?filter[territory]=USA&limit=200`);
        await api('POST', '/v1/subscriptionPrices', {
          data: {
            type: 'subscriptionPrices',
            relationships: {
              subscription: rel('subscriptions', sub.id),
              subscriptionPricePoint: rel('subscriptionPricePoints', USD(points, s.price)),
              territory: rel('territories', 'USA'),
            },
          },
        });
        console.log('  set USA price', s.price);
      }
    }

    // Lifetime: a non-consumable in-app purchase.
    const iaps = await all(`/v1/apps/${app}/inAppPurchasesV2`);
    let life = iaps.find((x) => x.attributes.productId === 'net.snobunny.arcanum.premium.lifetime');
    if (!life) {
      life = (
        await api('POST', '/v2/inAppPurchases', {
          data: {
            type: 'inAppPurchases',
            attributes: {
              name: 'Arcanum Cloud Lifetime',
              productId: 'net.snobunny.arcanum.premium.lifetime',
              inAppPurchaseType: 'NON_CONSUMABLE',
              reviewNote: 'Unlocks Arcanum Cloud forever under Settings › AI Services.',
            },
            relationships: { app: rel('apps', app) },
          },
        })
      ).data;
      await api('POST', '/v1/inAppPurchaseLocalizations', {
        data: {
          type: 'inAppPurchaseLocalizations',
          attributes: {
            name: 'Arcanum Cloud Lifetime',
            description: 'AI voices, picks and metadata, forever',
            locale: 'en-US',
          },
          relationships: { inAppPurchaseV2: rel('inAppPurchases', life.id) },
        },
      });
      const points = await all(`/v2/inAppPurchases/${life.id}/pricePoints?filter[territory]=USA&limit=200`);
      await api('POST', '/v1/inAppPurchasePriceSchedules', {
        data: {
          type: 'inAppPurchasePriceSchedules',
          relationships: {
            inAppPurchase: rel('inAppPurchases', life.id),
            baseTerritory: rel('territories', 'USA'),
            manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price-usa}' }] },
          },
        },
        included: [
          {
            type: 'inAppPurchasePrices',
            id: '${price-usa}',
            attributes: { startDate: null },
            relationships: {
              inAppPurchasePricePoint: rel('inAppPurchasePricePoints', USD(points, '39.99')),
            },
          },
        ],
      });
      await api('POST', '/v1/inAppPurchaseAvailabilities', {
        data: {
          type: 'inAppPurchaseAvailabilities',
          attributes: { availableInNewTerritories: true },
          relationships: {
            inAppPurchase: rel('inAppPurchases', life.id),
            availableTerritories: { data: territories.map((id) => ({ type: 'territories', id })) },
          },
        },
      });
      console.log('created lifetime', life.id);
    } else console.log('lifetime exists', life.id);
    console.log('done');
  },
};

const [cmd, ...args] = process.argv.slice(2);
if (!commands[cmd]) {
  console.error(`commands: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
commands[cmd](...args).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
