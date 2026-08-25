export interface RandomSource {
  int(min: number, max: number): number;
}

export class SeededRng implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  int(min: number, max: number): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const normalized = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    return Math.floor(normalized * (max - min + 1)) + min;
  }
}

export class SequenceRng implements RandomSource {
  private index = 0;

  constructor(private readonly values: number[]) {}

  int(min: number, max: number): number {
    const raw = this.values[this.index++ % this.values.length] ?? min;
    return Math.max(min, Math.min(max, raw));
  }
}
