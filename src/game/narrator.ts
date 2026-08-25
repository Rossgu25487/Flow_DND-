import { emberAudio, type NarrativeSoundCue } from './audio';

export type NarrationMood = 'address' | 'title' | 'narrative' | 'urgent' | 'ominous' | 'reflective';

export interface NarrationSegment {
  text: string;
  mood: NarrationMood;
  pauseAfter?: number;
  cues?: NarrativeSoundCue[];
}

const performance: Record<NarrationMood, { rate: number; pitch: number; pause: number }> = {
  address: { rate: 0.82, pitch: 0.68, pause: 260 },
  title: { rate: 0.76, pitch: 0.62, pause: 420 },
  narrative: { rate: 0.9, pitch: 0.78, pause: 220 },
  urgent: { rate: 0.97, pitch: 0.84, pause: 150 },
  ominous: { rate: 0.74, pitch: 0.57, pause: 480 },
  reflective: { rate: 0.83, pitch: 0.7, pause: 360 },
};

class EmberNarrator {
  private utterance: SpeechSynthesisUtterance | null = null;
  private pendingTimer: number | null = null;
  private generation = 0;
  private volume = 0.86;

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.utterance) this.utterance.volume = this.volume;
  }

  speak(script: NarrationSegment[] | string, onEnd?: () => void): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    const segments = typeof script === 'string'
      ? [{ text: script, mood: 'narrative' as const }]
      : script.filter((segment) => segment.text.trim());
    if (!segments.length) return false;
    this.stop();
    const generation = this.generation;
    emberAudio.duckMusic(true);
    this.playSegment(segments, 0, generation, onEnd);
    return true;
  }

  stop(): void {
    this.generation += 1;
    if (this.pendingTimer !== null) window.clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.utterance = null;
    emberAudio.duckMusic(false);
  }

  private playSegment(segments: NarrationSegment[], index: number, generation: number, onEnd?: () => void): void {
    if (generation !== this.generation) return;
    if (index >= segments.length) {
      this.utterance = null;
      emberAudio.duckMusic(false);
      onEnd?.();
      return;
    }
    const segment = segments[index];
    const direction = performance[segment.mood];
    const utterance = new SpeechSynthesisUtterance(this.prepareText(segment.text, segment.mood));
    utterance.lang = 'en-US';
    utterance.rate = direction.rate;
    utterance.pitch = direction.pitch;
    utterance.volume = this.volume;
    utterance.voice = this.selectVoice();
    segment.cues?.forEach((cue) => emberAudio.playNarrativeCue(cue));
    let continued = false;
    const continueScript = () => {
      if (continued) return;
      continued = true;
      if (generation !== this.generation) return;
      this.utterance = null;
      this.pendingTimer = window.setTimeout(
        () => this.playSegment(segments, index + 1, generation, onEnd),
        segment.pauseAfter ?? direction.pause,
      );
    };
    utterance.onend = continueScript;
    utterance.onerror = continueScript;
    this.utterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  private selectVoice(): SpeechSynthesisVoice | null {
    const preferred = ['guy', 'ryan', 'daniel', 'davis', 'microsoft', 'natural', 'google'];
    const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('en'));
    return [...voices].sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aRank = preferred.findIndex((name) => aName.includes(name));
      const bRank = preferred.findIndex((name) => bName.includes(name));
      return (aRank < 0 ? 99 : aRank) - (bRank < 0 ? 99 : bRank) || Number(b.localService) - Number(a.localService);
    })[0] ?? null;
  }

  private prepareText(text: string, mood: NarrationMood): string {
    const trimmed = text.trim();
    if (mood === 'ominous') return `${trimmed}...`;
    if (mood === 'title') return `${trimmed}.`;
    return trimmed;
  }
}

export const emberNarrator = new EmberNarrator();
