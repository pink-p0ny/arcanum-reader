import { Paths } from 'expo-file-system';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import type { ResolvedReaderSettings } from '@/lib/reader-theme';
import type { Position } from '@/lib/sync';
import type { Annotation } from '@/lib/types';

export type ReaderEvent =
  | { type: 'ready' }
  | { type: 'loaded'; title: string; toc: TocItem[]; sections: number }
  | {
      type: 'relocate';
      cfi: string | null;
      fraction: number;
      href: string | null;
      tocLabel: string | null;
      section: { current: number; total: number } | null;
      location: { current: number; total: number } | null;
    }
  | {
      type: 'selection';
      cfi: string;
      text: string;
      rect: Rect | null;
      chapter: string;
    }
  | { type: 'deselect' }
  | { type: 'annotationTap'; cfi: string; rect: Rect | null }
  | { type: 'tap'; x: number; y: number }
  | { type: 'externalLink'; href: string }
  | {
      type: 'annotationAdded';
      cfi: string;
      label: string | null;
      drawn: boolean;
    }
  | { type: 'ttsBlock'; sentences: { mark: string | null; text: string }[] }
  | { type: 'ttsEnd' }
  | { type: 'error'; message: string };

export interface TocItem {
  label: string;
  href: string | null;
  children: TocItem[];
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReaderHandle {
  send: (msg: Record<string, unknown>) => void;
}

interface Props {
  pageUri: string;
  fileUri: string;
  fileName: string;
  position: Position | null;
  settings: ResolvedReaderSettings;
  annotations: Pick<Annotation, 'cfi' | 'color' | 'style'>[];
  onEvent: (e: ReaderEvent) => void;
}

// react-native-webview's class overloads don't line up with the React 19 types shipped in SDK 58; cast once here.
const TypedWebView = WebView as unknown as React.ComponentType<WebViewProps & { ref?: React.Ref<WebView> }>;

export const ReaderWebView = forwardRef<ReaderHandle, Props>(function ReaderWebView(
  { pageUri, fileUri, fileName, position, settings, annotations, onEvent },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const opened = useRef(false);
  const latest = useRef({
    position,
    settings,
    annotations,
    onEvent,
  });
  latest.current = {
    position,
    settings,
    annotations,
    onEvent,
  };

  const send = useCallback((msg: Record<string, unknown>) => {
    webRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  useImperativeHandle(ref, () => ({ send }), [send]);

  // Re-theme live when settings change after the book is open. Compare by value: re-sending identical
  // settings makes foliate re-lay out the chapter, which fires relocate, which re-renders this screen.
  const sentSettings = useRef('');
  useEffect(() => {
    const key = JSON.stringify(settings);
    if (!opened.current || key === sentSettings.current) return;
    sentSettings.current = key;
    send({ type: 'settings', settings });
  }, [settings, send]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: ReaderEvent;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      opened.current = true;
      const { position: pos, settings: s, annotations: ann } = latest.current;
      sentSettings.current = JSON.stringify(s);
      send({
        type: 'open',
        url: fileUri,
        name: fileName,
        position: pos,
        settings: s,
        annotations: ann,
      });
    }
    latest.current.onEvent(msg);
  };

  return (
    <TypedWebView
      ref={webRef}
      source={{ uri: pageUri }}
      originWhitelist={['*']}
      allowingReadAccessToURL={Paths.document.uri}
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      onMessage={onMessage}
      style={[styles.web, { backgroundColor: settings.colors.bg }]}
      containerStyle={{ backgroundColor: settings.colors.bg }}
      bounces={false}
      scrollEnabled={false}
      overScrollMode="never"
      allowsBackForwardNavigationGestures={false}
      // Do not set allowsLinkPreview={false}: WebKit ties the text-selection edit menu (Copy, Look Up,
      // Translate) to the link-preview machinery, and turning it off silently removes that menu.
      dataDetectorTypes="none"
      // No `menuItems`: react-native-webview hides every system edit action (Copy, Look Up, Translate)
      // when custom items are set, and only shows the custom ones on its own long-press path. The app
      // adds Highlight / Note through SelectionBar instead.
      setSupportMultipleWindows={false}
      javaScriptEnabled
      domStorageEnabled
      webviewDebuggingEnabled={__DEV__}
      onError={(ev: { nativeEvent: { description: string } }) =>
        latest.current.onEvent({
          type: 'error',
          message: ev.nativeEvent.description,
        })
      }
    />
  );
});

const styles = StyleSheet.create({
  web: { flex: 1 },
});
