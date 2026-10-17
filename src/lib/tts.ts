import { setAudioModeAsync } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';

import { settingsStore } from './settings';
import { createStore } from './store';

export interface TtsState {
  active: boolean;
  playing: boolean;
  /** Sentence currently being spoken, for the player bar. */
  sentence: string;
  ended: boolean;
}

export const ttsStore = createStore<TtsState>({
  active: false,
  playing: false,
  sentence: '',
  ended: false,
});

type Send = (msg: Record<string, unknown>) => void;

interface Sentence {
  mark: string | null;
  text: string;
}

/**
 * Drives read-aloud: the reader page hands us one block of sentences at a time, we speak them with the
 * device voice and tell the page which sentence to highlight. One controller per open reader.
 */
export class TtsController {
  private send: Send = () => {};

  /** Called by the reader screen once the WebView bridge exists. */
  attach(send: Send) {
    this.send = send;
  }
  private queue: Sentence[] = [];
  private index = 0;
  private generation = 0;
  private sentenceTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly KEEP_AWAKE_TAG = 'grimmory-tts';

  async start() {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
    } catch {}
    activateKeepAwakeAsync(TtsController.KEEP_AWAKE_TAG).catch(() => {});
    ttsStore.set({ active: true, playing: true, sentence: '', ended: false });
    this.generation += 1;
    this.queue = [];
    this.index = 0;
    this.send({ type: 'ttsStart' });
  }

  /** Called when the page delivers the next block of sentences. */
  onBlock(sentences: Sentence[]) {
    if (!ttsStore.get().active) return;
    this.queue = sentences;
    this.index = 0;
    if (ttsStore.get().playing) this.speakCurrent();
    else this.showCurrent();
  }

  onEnd() {
    Speech.stop();
    ttsStore.set((s) => ({
      ...s,
      playing: false,
      ended: true,
      sentence: 'End of book',
    }));
  }

  pause() {
    this.generation += 1;
    Speech.stop();
    ttsStore.set((s) => ({ ...s, playing: false }));
  }

  resume() {
    if (ttsStore.get().ended) return;
    ttsStore.set((s) => ({ ...s, playing: true }));
    if (this.queue.length) this.speakCurrent();
    else this.send({ type: 'ttsNext' });
  }

  toggle() {
    if (ttsStore.get().playing) this.pause();
    else this.resume();
  }

  next() {
    this.generation += 1;
    Speech.stop();
    if (this.index + 1 < this.queue.length) {
      this.index += 1;
      if (ttsStore.get().playing) this.speakCurrent();
      else this.showCurrent();
    } else {
      this.queue = [];
      this.send({ type: 'ttsNext' });
    }
  }

  prev() {
    this.generation += 1;
    Speech.stop();
    if (this.index > 0) {
      this.index -= 1;
      if (ttsStore.get().playing) this.speakCurrent();
      else this.showCurrent();
    } else {
      this.queue = [];
      this.send({ type: 'ttsPrev' });
    }
  }

  /** Re-speak the current sentence with new voice or rate settings. */
  refresh() {
    if (ttsStore.get().playing && this.queue.length) {
      this.generation += 1;
      Speech.stop();
      this.speakCurrent();
    }
  }

  stop() {
    this.generation += 1;
    Speech.stop();
    if (this.sentenceTimer) clearTimeout(this.sentenceTimer);
    this.send({ type: 'ttsStop' });
    deactivateKeepAwake(TtsController.KEEP_AWAKE_TAG).catch(() => {});
    ttsStore.set({ active: false, playing: false, sentence: '', ended: false });
  }

  private showCurrent() {
    const s = this.queue[this.index];
    if (!s) return;
    ttsStore.set((st) => ({ ...st, sentence: s.text }));
    this.send({ type: 'ttsMark', mark: s.mark });
  }

  private speakCurrent() {
    const s = this.queue[this.index];
    if (!s) {
      this.send({ type: 'ttsNext' });
      return;
    }
    const gen = ++this.generation;
    this.showCurrent();
    const { ttsRate, ttsVoice } = settingsStore.get();
    const advance = () => {
      if (gen !== this.generation || !ttsStore.get().playing) return;
      this.index += 1;
      if (this.index < this.queue.length) this.speakCurrent();
      else {
        this.queue = [];
        this.send({ type: 'ttsNext' });
      }
    };
    Speech.speak(s.text, {
      rate: ttsRate,
      voice: ttsVoice ?? undefined,
      onDone: advance,
      onError: () => {
        // Skip unspeakable fragments rather than stalling.
        if (this.sentenceTimer) clearTimeout(this.sentenceTimer);
        this.sentenceTimer = setTimeout(advance, 150);
      },
    });
  }
}

export async function listVoices(language?: string) {
  const voices = await Speech.getAvailableVoicesAsync();
  const lang = (language ?? 'en').slice(0, 2).toLowerCase();
  const rank = (q: string) => (q === 'Enhanced' ? 0 : q === 'Premium' ? 0 : 1);
  return voices
    .filter((v) => v.language.toLowerCase().startsWith(lang))
    .sort((a, b) => rank(String(a.quality)) - rank(String(b.quality)) || a.name.localeCompare(b.name));
}

export const TTS_RATES = [0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
