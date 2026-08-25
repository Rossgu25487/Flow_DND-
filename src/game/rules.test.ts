import { describe, expect, it } from 'vitest';
import { SequenceRng, SeededRng } from './rng';
import { attackHits, rollD20, rollDice } from './rules';

describe('seeded random source', () => {
  it('replays the same sequence for the same seed', () => {
    const first = new SeededRng(42);
    const second = new SeededRng(42);
    expect(Array.from({ length: 8 }, () => first.int(1, 20))).toEqual(
      Array.from({ length: 8 }, () => second.int(1, 20)),
    );
  });
});

describe('d20 rules', () => {
  it('uses the higher roll for Advantage', () => {
    const result = rollD20(new SequenceRng([4, 17]), 3, true, false);
    expect(result.rolls).toEqual([4, 17]);
    expect(result.chosen).toBe(17);
    expect(result.total).toBe(20);
  });

  it('cancels Advantage and Disadvantage', () => {
    const result = rollD20(new SequenceRng([11, 20]), 2, true, true);
    expect(result.rolls).toEqual([11]);
    expect(result.total).toBe(13);
  });

  it('treats natural 20 and natural 1 as automatic attack results', () => {
    expect(attackHits(rollD20(new SequenceRng([20]), -10), 40)).toBe(true);
    expect(attackHits(rollD20(new SequenceRng([1]), 20), 5)).toBe(false);
  });

  it('doubles damage dice on a critical hit while retaining the modifier once', () => {
    expect(rollDice('1d8', new SequenceRng([5, 6]), 3, true)).toBe(14);
  });
});
