import type { RandomSource } from './rng';

export interface D20Result {
  rolls: number[];
  chosen: number;
  modifier: number;
  total: number;
  natural20: boolean;
  natural1: boolean;
}

export function rollD20(
  rng: RandomSource,
  modifier = 0,
  advantage = false,
  disadvantage = false,
): D20Result {
  const count = advantage === disadvantage ? 1 : 2;
  const rolls = Array.from({ length: count }, () => rng.int(1, 20));
  const chosen = count === 1 ? rolls[0] : advantage ? Math.max(...rolls) : Math.min(...rolls);
  return {
    rolls,
    chosen,
    modifier,
    total: chosen + modifier,
    natural20: chosen === 20,
    natural1: chosen === 1,
  };
}

export function rollDice(expression: string, rng: RandomSource, bonus = 0, critical = false): number {
  const match = /^(\d+)d(\d+)$/.exec(expression);
  if (!match) throw new Error(`Unsupported dice expression: ${expression}`);
  const count = Number(match[1]) * (critical ? 2 : 1);
  const sides = Number(match[2]);
  let total = bonus;
  for (let index = 0; index < count; index += 1) total += rng.int(1, sides);
  return Math.max(0, total);
}

export function attackHits(result: D20Result, armorClass: number): boolean {
  if (result.natural1) return false;
  if (result.natural20) return true;
  return result.total >= armorClass;
}
