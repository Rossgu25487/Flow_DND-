import { describe, expect, it } from 'vitest';
import { ashenBeaconPack } from '../content/ashenBeacon';
import { BattleRuntime } from './battleRuntime';

const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

describe('battle runtime', () => {
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
