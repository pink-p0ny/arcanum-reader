import Constants from 'expo-constants';

import { createStore } from './store';

/**
 * Arcanum Cloud subscription state, through RevenueCat. Identity is RevenueCat's anonymous app user id,
 * which is tied to the App Store receipt; no email or server address is ever involved.
 *
 * The SDK is native, so in Expo Go nothing here does anything and `available` stays false.
 */

export const ENTITLEMENT = 'premium';

/** Arcanum Cloud is hidden in production builds until the service exists; dev builds show it for sandbox tests. */
export const CLOUD_ENABLED = __DEV__;

export interface PremiumPackage {
  id: string;
  kind: 'monthly' | 'yearly' | 'lifetime';
  title: string;
  price: string;
  /** Opaque RevenueCat package handed back to `purchase`. */
  raw: unknown;
}

export const premiumStore = createStore<{
  available: boolean;
  loaded: boolean;
  active: boolean;
  packages: PremiumPackage[];
  error: string | null;
}>({ available: false, loaded: false, active: false, packages: [], error: null });

type PurchasesModule = typeof import('react-native-purchases');
type Purchases = PurchasesModule['default'];

let sdk: Purchases | null = null;
let loading: Promise<void> | null = null;

function loadSdk(): Purchases | null {
  if (sdk) return sdk;
  try {
    // Throws in Expo Go, where the native module is absent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = (require('react-native-purchases') as PurchasesModule).default;
    return sdk;
  } catch {
    return null;
  }
}

const apiKey = () =>
  (Constants.expoConfig?.extra as { revenueCatIosKey?: string } | undefined)?.revenueCatIosKey ?? '';

const kindOf = (identifier: string): PremiumPackage['kind'] =>
  /lifetime/i.test(identifier) ? 'lifetime' : /year|annual/i.test(identifier) ? 'yearly' : 'monthly';

export function ensurePremiumLoaded(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const Purchases = loadSdk();
      const key = apiKey();
      if (!Purchases || !key) {
        premiumStore.set((s) => ({ ...s, available: false, loaded: true }));
        return;
      }
      Purchases.configure({ apiKey: key });
      Purchases.addCustomerInfoUpdateListener((info) => {
        premiumStore.set((s) => ({ ...s, active: !!info.entitlements.active[ENTITLEMENT] }));
      });
      const [info, offerings] = await Promise.all([Purchases.getCustomerInfo(), Purchases.getOfferings()]);
      const packages: PremiumPackage[] = (offerings.current?.availablePackages ?? []).map((p) => ({
        id: p.identifier,
        kind: kindOf(p.product.identifier),
        title: p.product.title,
        price: p.product.priceString,
        raw: p,
      }));
      premiumStore.set({
        available: true,
        loaded: true,
        active: !!info.entitlements.active[ENTITLEMENT],
        packages,
        error: null,
      });
    })().catch((e) => {
      premiumStore.set((s) => ({ ...s, loaded: true, error: (e as Error).message }));
      loading = null;
    });
  }
  return loading;
}

export const isPremium = () => premiumStore.get().active;

/** RevenueCat's anonymous app user id: the only identity Arcanum Cloud ever sees. Null outside store builds. */
export async function subscriberId(): Promise<string | null> {
  await ensurePremiumLoaded();
  const Purchases = loadSdk();
  if (!Purchases || !premiumStore.get().available) return null;
  try {
    return await Purchases.getAppUserID();
  } catch {
    return null;
  }
}

/** Resolves true when the entitlement is active afterwards, false when the user cancelled. */
export async function purchase(pkg: PremiumPackage): Promise<boolean> {
  const Purchases = loadSdk();
  if (!Purchases) throw new Error('Purchases are not available in this build.');
  try {
    const { customerInfo } = await Purchases.purchasePackage(
      pkg.raw as Parameters<Purchases['purchasePackage']>[0],
    );
    const active = !!customerInfo.entitlements.active[ENTITLEMENT];
    premiumStore.set((s) => ({ ...s, active }));
    return active;
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

export async function restore(): Promise<boolean> {
  const Purchases = loadSdk();
  if (!Purchases) throw new Error('Purchases are not available in this build.');
  const info = await Purchases.restorePurchases();
  const active = !!info.entitlements.active[ENTITLEMENT];
  premiumStore.set((s) => ({ ...s, active }));
  return active;
}
