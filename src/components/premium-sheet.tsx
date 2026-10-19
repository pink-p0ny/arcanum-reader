import { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ensurePremiumLoaded, premiumStore, purchase, restore, type PremiumPackage } from '@/lib/premium';
import { useStore } from '@/lib/store';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after a purchase or restore made Arcanum Cloud active, before the sheet closes. */
  onActivated?: () => void;
}

const ORDER: PremiumPackage['kind'][] = ['yearly', 'monthly', 'lifetime'];
const LABEL: Record<PremiumPackage['kind'], string> = {
  yearly: 'Yearly',
  monthly: 'Monthly',
  lifetime: 'Lifetime',
};
const BLURB: Record<PremiumPackage['kind'], string> = {
  yearly: 'Best value',
  monthly: 'Cancel any time',
  lifetime: 'Pay once, keep it forever',
};
const SUFFIX: Record<PremiumPackage['kind'], string> = {
  yearly: ' / year',
  monthly: ' / month',
  lifetime: '',
};

/** The Arcanum Cloud paywall: three options, restore, and the legal links Apple requires. */
export function PremiumSheet({ visible, onClose, onActivated }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      {visible ? <Body onClose={onClose} onActivated={onActivated} /> : null}
    </Modal>
  );
}

function Body({ onClose, onActivated }: { onClose: () => void; onActivated?: () => void }) {
  const theme = useTheme();
  const premium = useStore(premiumStore);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    ensurePremiumLoaded();
  }, []);

  const buy = async (pkg: PremiumPackage) => {
    setBusy(pkg.id);
    try {
      if (await purchase(pkg)) {
        onActivated?.();
        onClose();
      }
    } catch (e) {
      Alert.alert('Purchase failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doRestore = async () => {
    setBusy('restore');
    try {
      const ok = await restore();
      Alert.alert(
        ok ? 'Restored' : 'Nothing to restore',
        ok ? 'Arcanum Cloud is active.' : 'No purchase found for this Apple ID.',
      );
      if (ok) {
        onActivated?.();
        onClose();
      }
    } catch (e) {
      Alert.alert('Restore failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const packages = [...premium.packages].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

  return (
    <View style={[styles.sheet, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Arcanum Cloud</ThemedText>
        <Pressable onPress={onClose} hitSlop={10}>
          <ThemedText style={styles.link}>Close</ThemedText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <ThemedText themeColor="textSecondary">
          AI read-aloud voices, picks that take your mood into account, and richer book metadata, run on our
          servers so there is nothing to set up. Stateless by design: nothing about your library is stored.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Prefer to run it yourself? The server is open source, and the app also works with your own API key.
          Both are free; see Settings › AI Services.
        </ThemedText>

        {premium.active ? (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={styles.cardTitle}>You are subscribed</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Manage or cancel under Settings › Apple ID › Subscriptions on your iPad.
            </ThemedText>
          </View>
        ) : !premium.loaded ? (
          <ThemedText themeColor="textSecondary">Loading prices…</ThemedText>
        ) : !premium.available ? (
          <ThemedText themeColor="textSecondary">
            {premium.error ?? 'Purchases are not available in this build.'}
          </ThemedText>
        ) : (
          packages.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => buy(p)}
              disabled={!!busy}
              style={[
                styles.card,
                { backgroundColor: theme.backgroundElement },
                busy ? styles.disabled : null,
              ]}
            >
              <View style={styles.cardRow}>
                <View style={styles.cardText}>
                  <ThemedText style={styles.cardTitle}>{LABEL[p.kind]}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {BLURB[p.kind]}
                  </ThemedText>
                </View>
                <ThemedText style={styles.price}>
                  {busy === p.id ? '…' : p.price}
                  {SUFFIX[p.kind]}
                </ThemedText>
              </View>
            </Pressable>
          ))
        )}

        <View style={styles.legal}>
          <Pressable onPress={doRestore} disabled={!!busy} hitSlop={8}>
            <ThemedText type="small" style={styles.link}>
              Restore Purchases
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() =>
              Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')
            }
            hitSlop={8}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Terms of Use
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => Linking.openURL('https://arcanum-reader.app/privacy.html')} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              Privacy Policy
            </ThemedText>
          </Pressable>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.fine}>
          Subscriptions renew automatically until cancelled at least 24 hours before the end of the period and
          are charged to your Apple ID. Lifetime is a one-time purchase.
        </ThemedText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  link: { color: '#e8734a', fontWeight: '600' },
  body: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  card: { borderRadius: 14, padding: Spacing.three, gap: 2 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  price: { fontSize: 17, fontWeight: '600', color: '#e8734a' },
  legal: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four, marginTop: Spacing.two },
  fine: { fontSize: 12, lineHeight: 16 },
  disabled: { opacity: 0.5 },
});
