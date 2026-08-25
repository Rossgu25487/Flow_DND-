import battleMusicUrl from '../assets/music/battle-theme.mp3';
import menuMusicUrl from '../assets/music/vampires-piano.mp3';

export type SoundCue =
  | 'ui'
  | 'dice'
  | 'move'
  | 'swing'
  | 'arrow'
  | 'hit'
  | 'crit'
  | 'spell'
  | 'heal'
  | 'pylon'
  | 'victory'
  | 'defeat';

export type NarrativeSoundCue = 'fire' | 'rumble' | 'wind' | 'ritual' | 'dragon';

class EmberAudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: { gain: GainNode; nodes: AudioNode[] } | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private desiredMusic: 'menu' | 'battle' | null = null;
  private currentMusic: HTMLAudioElement | null = null;
  private musicFade: number | null = null;
  private mixFade: number | null = null;
  private musicDuck = 1;
  private musicVolume = 0.65;
  private readonly music = new Map<'menu' | 'battle', HTMLAudioElement>();

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master) this.master.gain.setTargetAtTime(enabled ? 0.34 : 0, this.context?.currentTime ?? 0, 0.03);
    if (!enabled) {
      for (const track of this.music.values()) track.pause();
    } else if (this.desiredMusic) {
      this.playMusic(this.desiredMusic);
    }
  }

  async unlock(): Promise<void> {
    if (!this.enabled || typeof window === 'undefined') return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.34;
      this.master.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  play(cue: SoundCue): void {
    if (!this.enabled) return;
    void this.unlock().then(() => {
      if (!this.context || !this.master) return;
      const now = this.context.currentTime;
      switch (cue) {
        case 'ui':
          this.noise(0.035, 520, 0.07, 220);
          break;
        case 'dice':
          for (let index = 0; index < 5; index += 1) {
            window.setTimeout(() => this.noise(0.025, 900 + index * 130, 0.07), index * 28);
          }
          break;
        case 'move':
          this.noise(0.07, 170, 0.08);
          break;
        case 'swing':
          this.noise(0.12, 520, 0.16, 180);
          this.tone(190, 90, 0.1, 0.07, 'sawtooth');
          break;
        case 'arrow':
          this.noise(0.1, 1800, 0.1, 560);
          this.tone(640, 220, 0.09, 0.045, 'triangle');
          break;
        case 'hit':
          this.noise(0.11, 230, 0.25);
          this.tone(110, 54, 0.13, 0.18, 'square');
          break;
        case 'crit':
          this.noise(0.18, 360, 0.34);
          this.tone(135, 46, 0.2, 0.26, 'sawtooth');
          window.setTimeout(() => this.tone(720, 960, 0.12, 0.09, 'triangle'), 45);
          break;
        case 'spell':
          this.tone(230, 780, 0.24, 0.14, 'sine');
          this.tone(345, 1040, 0.2, 0.08, 'triangle', 0.025);
          this.noise(0.2, 1450, 0.08);
          break;
        case 'heal':
          this.tone(380, 620, 0.28, 0.08, 'sine');
          this.tone(570, 820, 0.24, 0.055, 'sine', 0.06);
          break;
        case 'pylon':
          this.tone(170, 58, 0.48, 0.18, 'sawtooth');
          this.noise(0.32, 420, 0.14);
          break;
        case 'victory':
          [262, 330, 392, 523].forEach((frequency, index) => {
            window.setTimeout(() => this.tone(frequency, frequency * 1.01, 0.36, 0.08, 'triangle'), index * 105);
          });
          break;
        case 'defeat':
          this.tone(150, 52, 0.8, 0.18, 'sawtooth');
          break;
        default:
          this.tone(440, 440, 0.05, 0.05, 'sine');
      }
      void now;
    });
  }

  playNarrativeCue(cue: NarrativeSoundCue): void {
    if (!this.enabled) return;
    void this.unlock().then(() => {
      if (!this.context || !this.master) return;
      if (cue === 'fire') {
        this.noise(1.25, 920, 0.035, 420);
        this.tone(58, 42, 1.35, 0.025, 'sine');
        for (let index = 0; index < 7; index += 1) {
          window.setTimeout(() => this.noise(0.045, 1400 + index * 170, 0.025, 620), 90 + index * 145);
        }
      }
      if (cue === 'rumble') {
        this.tone(62, 31, 1.7, 0.065, 'sine');
        this.noise(1.5, 230, 0.035, 80);
      }
      if (cue === 'wind') {
        this.noise(1.8, 720, 0.035, 310);
        this.tone(145, 105, 1.5, 0.012, 'sine');
      }
      if (cue === 'ritual') {
        this.tone(92, 138, 1.65, 0.038, 'sine');
        this.tone(139, 77, 1.45, 0.026, 'triangle', 0.08);
        this.noise(1.1, 520, 0.022, 190);
      }
      if (cue === 'dragon') {
        this.tone(74, 36, 1.65, 0.085, 'sawtooth');
        this.tone(111, 49, 1.4, 0.045, 'square', 0.04);
        this.noise(1.55, 280, 0.075, 72);
      }
    });
  }

  playMusic(mode: 'menu' | 'battle'): void {
    this.desiredMusic = mode;
    if (!this.enabled || typeof window === 'undefined') return;
    let next = this.music.get(mode);
    if (!next) {
      next = new Audio(mode === 'battle' ? battleMusicUrl : menuMusicUrl);
      next.loop = true;
      next.preload = 'auto';
      next.volume = 0;
      this.music.set(mode, next);
    }
    if (this.currentMusic === next && !next.paused) return;
    const previous = this.currentMusic;
    this.currentMusic = next;
    void next.play().catch(() => {
      // The next user gesture will retry playback.
    });
    if (this.musicFade !== null) window.clearInterval(this.musicFade);
    let step = 0;
    this.musicFade = window.setInterval(() => {
      step += 1;
      const progress = Math.min(1, step / 18);
      const target = this.musicTarget(mode);
      next!.volume = target * progress;
      if (previous && previous !== next) previous.volume = Math.max(0, target * (1 - progress));
      if (progress >= 1) {
        if (previous && previous !== next) previous.pause();
        if (this.musicFade !== null) window.clearInterval(this.musicFade);
        this.musicFade = null;
      }
    }, 35);
  }

  duckMusic(ducked: boolean): void {
    this.musicDuck = ducked ? 0.2 : 1;
    const currentMode = this.currentMusic === this.music.get('battle') ? 'battle' : 'menu';
    this.rampCurrentMusic(this.musicTarget(currentMode), ducked ? 160 : 360);
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.min(1, Math.max(0, volume));
    const currentMode = this.currentMusic === this.music.get('battle') ? 'battle' : 'menu';
    this.rampCurrentMusic(this.musicTarget(currentMode), 140);
  }

  startAmbience(): void {
    if (!this.enabled) return;
    void this.unlock().then(() => {
      if (!this.context || !this.master || this.ambience) return;
      const gain = this.context.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.025, this.context.currentTime + 1.8);
      gain.connect(this.master);

      const low = this.context.createOscillator();
      low.type = 'sine';
      low.frequency.value = 47;
      const lowGain = this.context.createGain();
      lowGain.gain.value = 0.32;
      low.connect(lowGain).connect(gain);

      const fifth = this.context.createOscillator();
      fifth.type = 'triangle';
      fifth.frequency.value = 70.5;
      const fifthGain = this.context.createGain();
      fifthGain.gain.value = 0.09;
      fifth.connect(fifthGain).connect(gain);

      const wind = this.context.createBufferSource();
      wind.buffer = this.noiseBuffer;
      wind.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 310;
      filter.Q.value = 0.55;
      const windGain = this.context.createGain();
      windGain.gain.value = 0.2;
      wind.connect(filter).connect(windGain).connect(gain);

      low.start();
      fifth.start();
      wind.start();
      this.ambience = { gain, nodes: [low, fifth, wind, lowGain, fifthGain, filter, windGain] };
    });
  }

  stopAmbience(): void {
    if (!this.context || !this.ambience) return;
    const current = this.ambience;
    current.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.12);
    window.setTimeout(() => {
      for (const node of current.nodes) {
        if ('stop' in node && typeof node.stop === 'function') {
          try { node.stop(); } catch { /* already stopped */ }
        }
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
      current.gain.disconnect();
      if (this.ambience === current) this.ambience = null;
    }, 800);
  }

  private tone(
    from: number,
    to: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    if (!this.context || !this.master) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private musicTarget(mode: 'menu' | 'battle'): number {
    const base = mode === 'battle' ? 0.16 : 0.18;
    return base * this.musicVolume * this.musicDuck;
  }

  private rampCurrentMusic(target: number, duration: number): void {
    if (!this.currentMusic || typeof window === 'undefined') return;
    if (this.musicFade !== null) return;
    if (this.mixFade !== null) window.clearInterval(this.mixFade);
    const track = this.currentMusic;
    const start = track.volume;
    const steps = Math.max(1, Math.round(duration / 20));
    let step = 0;
    this.mixFade = window.setInterval(() => {
      step += 1;
      const progress = Math.min(1, step / steps);
      track.volume = start + (target - start) * progress;
      if (progress >= 1) {
        if (this.mixFade !== null) window.clearInterval(this.mixFade);
        this.mixFade = null;
      }
    }, 20);
  }

  private noise(duration: number, frequency: number, volume: number, endFrequency = frequency): void {
    if (!this.context || !this.master || !this.noiseBuffer) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency, this.context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFrequency), this.context.currentTime + duration);
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    source.stop(this.context.currentTime + duration + 0.02);
  }

  private createNoiseBuffer(): AudioBuffer {
    const context = this.context!;
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.985 + white * 0.015;
      data[index] = previous * 3.2;
    }
    return buffer;
  }
}

export const emberAudio = new EmberAudioEngine();
