import { describe, expect, it } from 'vitest';
import { ashenBeaconPack } from '../content/ashenBeacon';
import { BattleRuntime } from './battleRuntime';

const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

describe('battle runtime', () => {
  it('exposes enemy intent, target odds, and a safe movement undo for the active hero', () => {
    const battle = ashenBeaconPack.battles.find((entry) => entry.id === 'outer-ward')!;
    const runtime = new BattleRuntime(ashenBeaconPack, battle, 77, { initialAdvantage: true });
    while (runtime.activeUnit?.team === 'enemies') runtime.runEnemyTurn();

    const before = runtime.getSnapshot();
    const active = before.units.find((unit) => unit.id === before.activeUnitId)!;
    expect(before.enemyIntents).toHaveLength(3);
    expect(before.enemyIntents.every((intent) => intent.targetId)).toBe(true);

    const attack = active.abilities.find((ability) => ability.target === 'enemy')!;
    expect(runtime.selectAbility(attack.id)).toBe(true);
    const preview = runtime.getSnapshot().targetPreviews;
    expect(preview).toHaveLength(3);
    expect(preview.every((target) => target.chance === null || (target.chance >= 0 && target.chance <= 100))).toBe(true);

    const cell = runtime.getSnapshot().reachableCells[0];
    const origin = { x: active.x, y: active.y, moveRemaining: active.moveRemaining };
    expect(runtime.moveActiveUnit(cell.x, cell.y)).toBe(true);
    expect(runtime.getSnapshot().canUndoMove).toBe(true);
    expect(runtime.undoLastMove()).toBe(true);
    const restored = runtime.getSnapshot().units.find((unit) => unit.id === active.id)!;
    expect({ x: restored.x, y: restored.y, moveRemaining: restored.moveRemaining }).toEqual(origin);
  });

  it('can complete the first encounter through serializable player decisions and enemy AI', () => {
    const battle = ashenBeaconPack.battles.find((entry) => entry.id === 'outer-ward')!;
    const runtime = new BattleRuntime(ashenBeaconPack, battle, 42, { initialAdvantage: true });

    for (let step = 0; step < 160 && runtime.getSnapshot().outcome === 'playing'; step += 1) {
      let snapshot = runtime.getSnapshot();
      const active = snapshot.units.find((unit) => unit.id === snapshot.activeUnitId)!;
      if (active.team === 'enemies') {
        runtime.runEnemyTurn();
        continue;
      }

      let target = snapshot.units
        .filter((unit) => unit.team === 'enemies' && unit.hp > 0)
        .sort((a, b) => manhattan(active, a) - manhattan(active, b))[0];
      let usable = active.abilities.find((ability) => ability.target === 'enemy' && manhattan(active, target) <= ability.range);
      if (!usable) {
        const cell = snapshot.reachableCells.sort((a, b) => manhattan(a, target) - manhattan(b, target))[0];
        if (cell) runtime.moveActiveUnit(cell.x, cell.y);
        snapshot = runtime.getSnapshot();
        const moved = snapshot.units.find((unit) => unit.id === snapshot.activeUnitId)!;
        target = snapshot.units
          .filter((unit) => unit.team === 'enemies' && unit.hp > 0)
          .sort((a, b) => manhattan(moved, a) - manhattan(moved, b))[0];
        usable = moved.abilities.find((ability) => ability.target === 'enemy' && manhattan(moved, target) <= ability.range);
      }
      if (usable) {
        runtime.selectAbility(usable.id);
        runtime.useSelectedOnUnit(target.id);
      }
      runtime.endTurn();
    }

    expect(runtime.getSnapshot().outcome).toBe('victory');
    expect(Object.keys(runtime.getPartyState())).toHaveLength(3);
  });
});
