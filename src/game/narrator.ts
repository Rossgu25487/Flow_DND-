import { emberAudio, type NarrativeSoundCue } from './audio';

export type NarrationMood = 'address' | 'title' | 'narrative' | 'urgent' | 'ominous' | 'reflective';

export interface NarrationSegment {
  text: string;
  mood: NarrationMood;
  pauseAfter?: number;
  cues?: NarrativeSoundCue[];
  audioUrl?: string;
}

const pauseByMood: Record<NarrationMood, number> = {
  address: 260,
  title: 420,
  narrative: 220,
  urgent: 150,
  ominous: 480,
  reflective: 360,
};

const minimumPauseByMood: Record<NarrationMood, number> = {
  address: 360,
  title: 620,
  narrative: 360,
  urgent: 260,
  ominous: 680,
  reflective: 520,
};

class EmberNarrator {
  private audio: HTMLAudioElement | null = null;
  private pendingTimer: number | null = null;
  private generation = 0;
  private volume = 0.86;

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.audio) this.audio.volume = this.volume;
  }

  speak(script: NarrationSegment[], onEnd?: () => void, onStart?: () => void): boolean {
    if (typeof window === 'undefined') return false;
    const segments = script.filter((segment) => segment.text.trim() && segment.audioUrl);
    if (!segments.length) return false;
    this.stop();
    const generation = this.generation;
    const started = { value: false };
    emberAudio.duckMusic(true);
    this.playSegment(segments, 0, generation, started, onEnd, onStart);
    return true;
  }

  stop(): void {
    this.generation += 1;
    if (this.pendingTimer !== null) window.clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.audio = null;
    emberAudio.duckMusic(false);
  }

  private playSegment(
    segments: NarrationSegment[],
    index: number,
    generation: number,
    started: { value: boolean },
    onEnd?: () => void,
    onStart?: () => void,
  ): void {
    if (generation !== this.generation) return;
    if (index >= segments.length) {
      this.audio = null;
      emberAudio.duckMusic(false);
      onEnd?.();
      return;
    }
    const segment = segments[index];
    const audio = new Audio(segment.audioUrl!);
    audio.preload = 'auto';
    audio.volume = this.volume;
    this.audio = audio;
    segment.cues?.forEach((cue) => emberAudio.playNarrativeCue(cue));
    const nextUrl = segments[index + 1]?.audioUrl;
    if (nextUrl) {
      const preload = new Audio(nextUrl);
      preload.preload = 'auto';
      preload.load();
    }
    let continued = false;
    const continueScript = () => {
      if (continued || generation !== this.generation) return;
      continued = true;
      this.audio = null;
      const holdMs = Math.max(
        segment.pauseAfter ?? pauseByMood[segment.mood],
        minimumPauseByMood[segment.mood],
        Math.max(240, Math.min(900, segment.text.length * 14)),
      );
      this.pendingTimer = window.setTimeout(
        () => this.playSegment(segments, index + 1, generation, started, onEnd, onStart),
        holdMs,
      );
    };
    audio.onended = continueScript;
    audio.onerror = continueScript;
    void audio.play().then(() => {
      if (!started.value && generation === this.generation) {
        started.value = true;
        onStart?.();
      }
    }).catch(continueScript);
  }
}

export const emberNarrator = new EmberNarrator();
