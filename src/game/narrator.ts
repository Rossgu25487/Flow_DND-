import { emberAudio } from './audio';
import type { Locale } from './types';

class EmberNarrator {
  private utterance: SpeechSynthesisUtterance | null = null;

  speak(text: string, locale: Locale, onEnd?: () => void): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    this.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
    utterance.rate = locale === 'zh-CN' ? 0.88 : 0.92;
    utterance.pitch = 0.78;
    utterance.volume = 0.92;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase().startsWith(locale === 'zh-CN' ? 'zh' : 'en')) ?? null;
    const finish = () => {
      if (this.utterance !== utterance) return;
      this.utterance = null;
      emberAudio.duckMusic(false);
      onEnd?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    this.utterance = utterance;
    emberAudio.duckMusic(true);
    window.speechSynthesis.speak(utterance);
    return true;
  }

  stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.utterance = null;
    emberAudio.duckMusic(false);
  }
}

export const emberNarrator = new EmberNarrator();
