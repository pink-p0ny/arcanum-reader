import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnnotationBar } from '@/components/reader/annotation-bar';
import { DEFAULT_COLOR } from '@/components/reader/highlight-colors';
import { NoteModal } from '@/components/reader/note-modal';
import {
  ReaderWebView,
  type ReaderEvent,
  type ReaderHandle,
  type TocItem,
} from '@/components/reader/reader-webview';
import { SelectionBar } from '@/components/reader/selection-bar';
import { SettingsSheet } from '@/components/reader/settings-sheet';
import { SearchSheet, type SearchState } from '@/components/reader/search-sheet';
import { TocSheet } from '@/components/reader/toc-sheet';
import { TtsBar } from '@/components/reader/tts-bar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getProvider } from '@/lib/provider';
import { getBook, type LocalAnnotation } from '@/lib/db';
import { downloadBook, downloadsStore, localBookFile } from '@/lib/downloads';
import { pickReadableFile } from '@/lib/formats';
import { readerPageUri } from '@/lib/reader-asset';
import { resolveReaderSettings } from '@/lib/reader-theme';
import { settingsStore } from '@/lib/settings';
import { SessionTracker } from '@/lib/stats';
import { TtsController, ttsStore } from '@/lib/tts';
import { addEditMenuListener, editMenuAvailable, setEditMenuItems } from '../../../modules/webview-edit-menu';
import {
  createAnnotation,
  deleteAnnotation,
  flushPending,
  loadAnnotations,
  resolveStartPosition,
  saveProgress,
  updateAnnotation,
  type Position,
} from '@/lib/sync';
import type { AnnotationStyle, AppBookDetail } from '@/lib/types';

interface Loaded {
  pageUri: string;
  fileUri: string;
  fileName: string;
  fileId: number | null;
  title: string;
  position: Position | null;
  annotations: LocalAnnotation[];
}

// Shown at the front of the system text-selection menu (Highlight, Add Note, Translate, Search, …) when
// the native hook is in the binary; Expo Go falls back to the in-app SelectionBar.
const EDIT_MENU = [
  { key: 'highlight', label: 'Highlight' },
  { key: 'note', label: 'Add Note' },
];

export default function ReadScreen() {
  const { id, cfi: jumpCfi } = useLocalSearchParams<{
    id: string;
    cfi?: string;
  }>();
  const bookId = Number(id);
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const settings = useStore(settingsStore);
  const resolved = resolveReaderSettings(settings, scheme);
  const dl = useStore(downloadsStore, (s) => s[bookId]);

  const reader = useRef<ReaderHandle>(null);
  const [tts] = useState(() => new TtsController());
  const ttsActive = useStore(ttsStore, (s) => s.active);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chrome, setChrome] = useState(true);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState<SearchState | null>(null);
  const searchId = useRef(0);
  const [showSettings, setShowSettings] = useState(false);
  const [location, setLocation] = useState<{
    fraction: number;
    label: string | null;
    cfi: string | null;
    href: string | null;
  }>({
    fraction: 0,
    label: null,
    cfi: null,
    href: null,
  });
  const annotationsRef = useRef<LocalAnnotation[]>([]);
  const [active, setActive] = useState<LocalAnnotation | null>(null);
  const [noteTarget, setNoteTarget] = useState<{
    annotation?: LocalAnnotation;
    selection?: { cfi: string; text: string; chapter: string };
  } | null>(null);
  const [selection, setSelection] = useState<{
    cfi: string;
    text: string;
    chapter: string;
  } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string | null>(null);

  // ---- open the book ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summary = await getBook(bookId);
        let detail: AppBookDetail | null = null;
        try {
          detail = await getProvider(bookId).bookDetail(bookId);
        } catch {}
        const pick = pickReadableFile(detail?.files, {
          id: summary?.primaryFileId,
          type: summary?.primaryFileType,
          name: summary?.primaryFileName,
        });
        if (!pick)
          throw new Error(
            `This book is ${summary?.primaryFileType ?? 'in a format'} the reader cannot open yet.`,
          );
        const fileId = pick.id;

        const file = (await localBookFile(bookId)) ?? (await downloadBook(bookId, fileId, pick.type));

        const [pageUri, annotations, position] = await Promise.all([
          readerPageUri(),
          loadAnnotations(bookId),
          resolveStartPosition(detail, bookId),
        ]);
        if (cancelled) return;
        annotationsRef.current = annotations;
        setLoaded({
          pageUri,
          fileUri: file.uri,
          fileName: pick.name,
          fileId,
          title: detail?.title ?? summary?.title ?? '',
          position: jumpCfi ? { cfi: jumpCfi, href: null, fraction: position?.fraction ?? 0 } : position,
          annotations,
        });
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, jumpCfi]);

  useEffect(() => {
    tts.attach((msg) => reader.current?.send(msg));
    return () => tts.stop();
  }, [tts]);

  // Reading time for the stats card; stops (and records) when the screen unmounts.
  useEffect(() => {
    const tracker = new SessionTracker(bookId);
    return () => tracker.stop();
  }, [bookId]);

  // ---- progress ----
  const persist = useCallback(
    (pos: Position) => {
      if (!loaded) return;
      const key = `${pos.cfi}|${pos.fraction.toFixed(4)}`;
      if (key === lastSaved.current) return;
      lastSaved.current = key;
      saveProgress(bookId, loaded.fileId, pos).catch(() => {});
    },
    [bookId, loaded],
  );

  const scheduleSave = useCallback(
    (pos: Position) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(pos), 1500);
    },
    [persist],
  );

  const close = useCallback(() => {
    tts.stop();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (location.cfi || location.fraction > 0)
      persist({
        cfi: location.cfi,
        href: location.href,
        fraction: location.fraction,
      });
    qc.invalidateQueries({ queryKey: ['library'] });
    qc.invalidateQueries({ queryKey: ['home'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
    qc.invalidateQueries({ queryKey: ['book', bookId] });
    qc.invalidateQueries({ queryKey: ['annotations', bookId] });
    flushPending().catch(() => {});
    router.back();
  }, [location, persist, qc, bookId, router, tts]);

  // ---- events from the page ----
  const onEvent = useCallback(
    (e: ReaderEvent) => {
      switch (e.type) {
        case 'loaded':
          setToc(e.toc);
          break;
        case 'relocate': {
          const next = {
            fraction: e.fraction,
            label: e.tocLabel,
            cfi: e.cfi,
            href: e.href,
          };
          setLocation(next);
          scheduleSave({ cfi: e.cfi, href: e.href, fraction: e.fraction });
          break;
        }
        case 'selection':
          setSelection({ cfi: e.cfi, text: e.text, chapter: e.chapter });
          setActive(null);
          break;
        case 'deselect':
          setSelection(null);
          break;
        case 'annotationTap': {
          const a = annotationsRef.current.find((x) => x.cfi === e.cfi);
          if (a) {
            setActive(a);
            setChrome(false);
          }
          break;
        }
        case 'tap':
          if (active) {
            setActive(null);
          } else if (settings.flow === 'paginated' && e.x < 0.18) reader.current?.send({ type: 'prev' });
          else if (settings.flow === 'paginated' && e.x > 0.82) reader.current?.send({ type: 'next' });
          else setChrome((v) => !v);
          break;
        case 'searchResults':
          if (e.id === searchId.current)
            setSearch((s) => (s ? { ...s, groups: [...s.groups, { label: e.label, items: e.items }] } : s));
          break;
        case 'searchProgress':
          if (e.id === searchId.current) setSearch((s) => (s ? { ...s, progress: e.progress } : s));
          break;
        case 'searchDone':
          if (e.id === searchId.current) setSearch((s) => (s ? { ...s, progress: null } : s));
          break;
        case 'ttsBlock':
          tts.onBlock(e.sentences);
          break;
        case 'ttsEnd':
          tts.onEnd();
          break;
        case 'externalLink':
          Alert.alert('Open link?', e.href, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open', onPress: () => Linking.openURL(e.href) },
          ]);
          break;
        case 'error':
          console.warn('[reader]', e.message);
          if (!loaded) setLoadError(e.message);
          else if (/Could not read book file|not supported/i.test(e.message)) setLoadError(e.message);
          break;
      }
    },
    [active, scheduleSave, settings.flow, loaded, tts],
  );

  // ---- highlights ----
  const addHighlight = useCallback(
    async (
      sel: { cfi: string; text: string; chapter: string },
      note?: string,
      color: string = DEFAULT_COLOR,
      style: AnnotationStyle = 'highlight',
    ) => {
      reader.current?.send({ type: 'deselect' });
      setSelection(null);
      const existing = annotationsRef.current.find((a) => a.cfi === sel.cfi);
      if (existing) {
        if (note !== undefined) await updateAnnotation(existing, { note });
        return existing;
      }
      reader.current?.send({
        type: 'addAnnotation',
        cfi: sel.cfi,
        color,
        style,
      });
      const created = await createAnnotation({
        bookId,
        cfi: sel.cfi,
        text: sel.text,
        color,
        style,
        note,
        chapterTitle: sel.chapter || undefined,
      });
      annotationsRef.current = [...annotationsRef.current, created];
      return created;
    },
    [bookId],
  );

  // Native edit-menu actions arrive outside React's event flow; read the selection through a ref.
  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  useEffect(() => {
    if (!editMenuAvailable) return;
    setEditMenuItems(EDIT_MENU);
    const sub = addEditMenuListener((key) => {
      const sel = selectionRef.current;
      if (!sel) return;
      if (key === 'note') setNoteTarget({ selection: sel });
      else if (key === 'highlight')
        addHighlight(sel)
          .then((a) => {
            // Like Apple Books: highlight with the last colour, then offer the palette.
            if (a) setActive(a);
          })
          .catch(() => {});
    });
    return () => {
      sub?.remove();
      setEditMenuItems([]);
    };
  }, [addHighlight]);

  const changeActive = useCallback(
    async (patch: { color?: string; style?: AnnotationStyle; note?: string }) => {
      if (!active) return;
      const next = { ...active, ...patch };
      setActive(next);
      annotationsRef.current = annotationsRef.current.map((a) => (a.localId === active.localId ? next : a));
      if (patch.color || patch.style) {
        reader.current?.send({
          type: 'updateAnnotation',
          cfi: active.cfi,
          color: next.color ?? DEFAULT_COLOR,
          style: next.style ?? 'highlight',
        });
      }
      await updateAnnotation(active, patch);
    },
    [active],
  );

  const removeActive = useCallback(async () => {
    if (!active) return;
    reader.current?.send({ type: 'removeAnnotation', cfi: active.cfi });
    annotationsRef.current = annotationsRef.current.filter((a) => a.localId !== active.localId);
    const target = active;
    setActive(null);
    await deleteAnnotation(target);
  }, [active]);

  // ---- render ----
  const bg = resolved.colors.bg;
  const fg = resolved.colors.fg;

  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: bg, paddingTop: insets.top }]}>
        <ThemedText style={{ color: fg, textAlign: 'center' }}>{loadError}</ThemedText>
        <Pressable onPress={() => router.back()} style={styles.button}>
          <ThemedText style={styles.buttonText}>Back</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <View style={[styles.page, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {loaded ? (
          <ReaderWebView
            ref={reader}
            pageUri={loaded.pageUri}
            fileUri={loaded.fileUri}
            fileName={loaded.fileName}
            position={loaded.position}
            settings={resolved}
            annotations={loaded.annotations.map((a) => ({
              cfi: a.cfi,
              color: a.color,
              style: a.style,
            }))}
            onEvent={onEvent}
          />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={fg} />
            <ThemedText style={{ color: fg }}>
              {dl?.status === 'downloading' ? `Downloading ${Math.round(dl.progress * 100)}%` : 'Opening…'}
            </ThemedText>
          </View>
        )}
      </View>

      {chrome ? (
        <>
          <View
            style={[
              styles.topBar,
              {
                paddingTop: insets.top,
                backgroundColor: bg,
                borderBottomColor: `${fg}22`,
              },
            ]}
          >
            <Pressable onPress={close} hitSlop={10} style={styles.barButton}>
              <ThemedText style={[styles.barAction, { color: '#e8734a' }]}>‹ Library</ThemedText>
            </Pressable>
            <ThemedText numberOfLines={1} style={[styles.barTitle, { color: fg }]}>
              {loaded?.title ?? ''}
            </ThemedText>
            <View style={styles.barRight}>
              {!ttsActive ? (
                <Pressable onPress={() => tts.start()} hitSlop={10} style={styles.barButton}>
                  <ThemedText style={[styles.barAction, { color: fg }]}>Listen</ThemedText>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setShowToc(true)} hitSlop={10} style={styles.barButton}>
                <ThemedText style={[styles.barAction, { color: fg }]}>☰</ThemedText>
              </Pressable>
              <Pressable onPress={() => setShowSearch(true)} hitSlop={10} style={styles.barButton}>
                <ThemedText style={[styles.barAction, { color: fg }]}>⌕</ThemedText>
              </Pressable>
              <Pressable onPress={() => setShowSettings(true)} hitSlop={10} style={styles.barButton}>
                <ThemedText style={[styles.barAction, { color: fg }]}>Aa</ThemedText>
              </Pressable>
            </View>
          </View>
          {ttsActive ? null : (
            <View
              style={[
                styles.bottomBar,
                {
                  paddingBottom: insets.bottom + 6,
                  backgroundColor: bg,
                  borderTopColor: `${fg}22`,
                },
              ]}
            >
              <ThemedText type="small" numberOfLines={1} style={[styles.chapter, { color: fg }]}>
                {location.label ?? ''}
              </ThemedText>
              <Pressable
                style={styles.track}
                onPress={(ev) => {
                  const { locationX } = ev.nativeEvent;
                  const width = (ev.currentTarget as unknown as { __width?: number }).__width;
                  if (width)
                    reader.current?.send({
                      type: 'goToFraction',
                      fraction: Math.min(1, Math.max(0, locationX / width)),
                    });
                }}
                onLayout={(ev) =>
                  ((ev.currentTarget as unknown as { __width?: number }).__width =
                    ev.nativeEvent.layout.width)
                }
              >
                <View style={[styles.trackBg, { backgroundColor: `${fg}33` }]}>
                  <View style={[styles.trackFill, { width: `${Math.round(location.fraction * 100)}%` }]} />
                </View>
              </Pressable>
              <ThemedText type="small" style={[styles.percent, { color: fg }]}>
                {Math.round(location.fraction * 100)}%
              </ThemedText>
            </View>
          )}
        </>
      ) : null}

      {ttsActive ? <TtsBar controller={tts} colors={{ bg, fg }} bottomInset={insets.bottom} /> : null}

      {selection && !active && !noteTarget && !editMenuAvailable ? (
        <SelectionBar
          colors={{
            bg: resolved.dark ? '#2a2a2a' : '#ffffff',
            fg: resolved.dark ? '#eee' : '#111',
          }}
          bottomOffset={chrome && !ttsActive ? insets.bottom + 56 : insets.bottom + Spacing.four}
          onHighlight={(color, style) => addHighlight(selection, undefined, color, style)}
          onNote={() => setNoteTarget({ selection })}
          onCancel={() => reader.current?.send({ type: 'deselect' })}
        />
      ) : null}

      {active ? (
        <AnnotationBar
          annotation={active}
          colors={{
            bg: resolved.dark ? '#2a2a2a' : '#ffffff',
            fg: resolved.dark ? '#eee' : '#111',
          }}
          onChange={changeActive}
          onNote={() => setNoteTarget({ annotation: active })}
          onDelete={removeActive}
          onClose={() => setActive(null)}
        />
      ) : null}

      <SearchSheet
        visible={showSearch}
        state={search}
        onSearch={(query) => {
          const id = ++searchId.current;
          if (!query) {
            setSearch(null);
            reader.current?.send({ type: 'clearSearch' });
            return;
          }
          setSearch({ query, groups: [], progress: 0 });
          reader.current?.send({ type: 'search', query, id });
        }}
        onSelect={(cfi) => {
          setShowSearch(false);
          reader.current?.send({ type: 'goTo', target: cfi });
        }}
        onClear={() => {
          searchId.current += 1;
          setSearch(null);
          reader.current?.send({ type: 'clearSearch' });
        }}
        onClose={() => setShowSearch(false)}
      />
      <TocSheet
        visible={showToc}
        toc={toc}
        currentLabel={location.label}
        onSelect={(href) => {
          setShowToc(false);
          reader.current?.send({ type: 'goTo', target: href });
        }}
        onClose={() => setShowToc(false)}
      />
      <SettingsSheet visible={showSettings} onClose={() => setShowSettings(false)} />
      <NoteModal
        key={
          noteTarget
            ? `${noteTarget.annotation?.localId ?? 'sel'}:${noteTarget.selection?.cfi ?? ''}`
            : 'none'
        }
        visible={!!noteTarget}
        quote={noteTarget?.annotation?.text ?? noteTarget?.selection?.text ?? ''}
        initialNote={noteTarget?.annotation?.note ?? ''}
        onCancel={() => setNoteTarget(null)}
        onSave={async (note) => {
          const t = noteTarget;
          setNoteTarget(null);
          if (t?.selection) await addHighlight(t.selection, note);
          else if (t?.annotation) await changeActive({ note });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  button: {
    backgroundColor: '#e8734a',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    height: 44,
    boxSizing: 'content-box',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barButton: { paddingVertical: 6, paddingHorizontal: 4 },
  barAction: { fontSize: 17, fontWeight: '600' },
  barTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    marginHorizontal: Spacing.two,
  },
  barRight: { flexDirection: 'row', gap: Spacing.three },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chapter: { flexShrink: 1, maxWidth: '35%' },
  track: { flex: 1, paddingVertical: 10 },
  trackBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  trackFill: { height: 4, backgroundColor: '#e8734a' },
  percent: { width: 40, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
