import type {
  AbilityDefinition,
  BattleDefinition,
  BattleEvent,
  BattleObjectState,
  BattleSnapshot,
  BattleUnitState,
  ContentPack,
  EnemyIntent,
  LocalizedText,
  StatusId,
  TargetPreview,
  UnitPersistentState,
} from './types';
import { SeededRng, type RandomSource } from './rng';
import { attackHits, rollD20, rollDice } from './rules';

export interface BattleRuntimeOptions {
  veteran?: boolean;
  initialAdvantage?: boolean;
  inactiveObjectIds?: string[];
  party?: Record<string, UnitPersistentState>;
}

const text = (zh: string, en: string): LocalizedText => ({ 'zh-CN': zh, 'en-US': en });

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function hasStatus(unit: BattleUnitState, status: StatusId): boolean {
  return unit.statuses.includes(status);
}

export class BattleRuntime {
  readonly definition: BattleDefinition;
  readonly rng: RandomSource;
  private readonly veteran: boolean;
  private readonly terrainMap = new Map<string, 'difficult' | 'blocked' | 'cover'>();
  private units: BattleUnitState[];
  private objects: BattleObjectState[];
  private turnOrder: string[];
  private turnIndex = 0;
  private round = 1;
  private outcome: BattleSnapshot['outcome'] = 'playing';
  private selectedAbilityId: string | null = null;
  private events: BattleEvent[] = [];
  private eventId = 0;
  private moveUndo: { unitId: string; x: number; y: number; moveRemaining: number; eventId: number } | null = null;

  constructor(pack: ContentPack, definition: BattleDefinition, seed: number, options: BattleRuntimeOptions = {}) {
    this.definition = definition;
    this.rng = new SeededRng(seed);
    this.veteran = Boolean(options.veteran);
    definition.terrain.forEach((cell) => this.terrainMap.set(`${cell.x},${cell.y}`, cell.kind));
    this.objects = (definition.objects ?? []).map((object) => ({
      ...object,
      active: options.inactiveObjectIds?.includes(object.id) ? false : object.active,
    }));

    const templates = new Map(pack.units.map((unit) => [unit.id, unit]));
    this.units = [...definition.heroes, ...definition.enemies].map((placement) => {
      const template = templates.get(placement.templateId);
      if (!template) throw new Error(`Missing unit template ${placement.templateId}`);
      const persisted = options.party?.[template.id];
      const hpScale = template.team === 'enemies' && this.veteran ? 1.2 : 1;
      const maxHp = Math.ceil(template.maxHp * hpScale);
      const hp = persisted ? Math.min(maxHp, Math.max(1, persisted.hp)) : maxHp;
      return {
        id: placement.id,
        templateId: template.id,
        name: template.name,
        role: template.role,
        team: template.team,
        maxHp,
        hp,
        ac: template.ac,
        speed: template.speed,
        initiative: template.initiative,
        saves: template.saves,
        color: template.color,
        accent: template.accent,
        abilities: template.abilities,
        resources: { ...(template.resources ?? {}), ...(persisted?.resources ?? {}) },
        tags: [...(template.tags ?? [])],
        x: placement.x,
        y: placement.y,
        statuses: template.team === 'heroes' && options.initialAdvantage ? ['advantage-next'] : [],
        actionAvailable: true,
        bonusAvailable: true,
        moveRemaining: template.speed,
        reactionAvailable: true,
        sneakAttackUsed: false,
      } satisfies BattleUnitState;
    });

    this.turnOrder = [...this.units]
      .map((unit) => ({ id: unit.id, score: this.rng.int(1, 20) + unit.initiative }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.id);
    this.addEvent('system', text(`战斗开始：${definition.name['zh-CN']}`, `Battle begins: ${definition.name['en-US']}`));
    this.resetActiveUnit();
  }

  get activeUnit(): BattleUnitState | null {
    const id = this.turnOrder[this.turnIndex];
    return this.units.find((unit) => unit.id === id && unit.hp > 0) ?? null;
  }

  getSnapshot(): BattleSnapshot {
    const active = this.activeUnit;
    return {
      battleId: this.definition.id,
      round: this.round,
      activeUnitId: active?.id ?? null,
      units: this.units.map((unit) => ({ ...unit, resources: { ...unit.resources }, statuses: [...unit.statuses] })),
      objects: this.objects.map((object) => ({ ...object })),
      events: [...this.events],
      outcome: this.outcome,
      selectedAbilityId: this.selectedAbilityId,
      reachableCells: active?.team === 'heroes' ? this.getReachableCells(active.id) : [],
      enemyIntents: this.getEnemyIntents(),
      targetPreviews: this.getTargetPreviews(),
      canUndoMove: Boolean(this.moveUndo && active?.id === this.moveUndo.unitId && active.team === 'heroes'),
    };
  }

  getPartyState(): Record<string, UnitPersistentState> {
    return Object.fromEntries(
      this.units
        .filter((unit) => unit.team === 'heroes')
        .map((unit) => [
          unit.templateId,
          {
            templateId: unit.templateId,
            hp: Math.max(1, unit.hp),
            resources: { ...unit.resources },
          },
        ]),
    );
  }

  selectAbility(abilityId: string): boolean {
    const unit = this.activeUnit;
    if (!unit || unit.team !== 'heroes' || unit.hp <= 0) return false;
    const ability = unit.abilities.find((candidate) => candidate.id === abilityId);
    if (!ability || !this.canPay(unit, ability)) return false;

    if (ability.target === 'self') {
      return this.resolveAbility(unit, ability, unit);
    }
    this.selectedAbilityId = this.selectedAbilityId === abilityId ? null : abilityId;
    return true;
  }

  useSelectedOnUnit(targetId: string): boolean {
    const unit = this.activeUnit;
    if (!unit || !this.selectedAbilityId) return false;
    const ability = unit.abilities.find((candidate) => candidate.id === this.selectedAbilityId);
    const target = this.units.find((candidate) => candidate.id === targetId);
    if (!ability || !target || ability.target !== 'enemy' || target.team === unit.team || target.hp <= 0) return false;
    const resolved = this.resolveAbility(unit, ability, target);
    if (resolved) this.selectedAbilityId = null;
    return resolved;
  }

  moveActiveUnit(x: number, y: number): boolean {
    const unit = this.activeUnit;
    if (!unit || unit.team !== 'heroes' || unit.hp <= 0) return false;
    const distances = this.computeReachable(unit);
    const cost = distances.get(`${x},${y}`);
    if (cost === undefined || cost <= 0 || cost > unit.moveRemaining) return false;
    const origin = { x: unit.x, y: unit.y };
    const beforeEventId = this.eventId;
    this.moveUndo = { unitId: unit.id, x: unit.x, y: unit.y, moveRemaining: unit.moveRemaining, eventId: beforeEventId };
    unit.x = x;
    unit.y = y;
    unit.moveRemaining -= cost;
    this.addEvent('move', text(`${unit.name['zh-CN']}移动了${cost}格`, `${unit.name['en-US']} moved ${cost} spaces`));
    this.resolveOpportunityAttacks(unit, origin);
    if (this.events.some((event) => event.id > beforeEventId && (event.type === 'roll' || event.type === 'damage'))) this.moveUndo = null;
    this.checkOutcome();
    return true;
  }

  undoLastMove(): boolean {
    const unit = this.activeUnit;
    const undo = this.moveUndo;
    if (!unit || !undo || unit.id !== undo.unitId || unit.team !== 'heroes') return false;
    unit.x = undo.x;
    unit.y = undo.y;
    unit.moveRemaining = undo.moveRemaining;
    this.events = this.events.filter((event) => event.id <= undo.eventId);
    this.eventId = undo.eventId;
    this.moveUndo = null;
    this.addEvent('move', text(`${unit.name['zh-CN']}撤回移动`, `${unit.name['en-US']} undoes the move`));
    return true;
  }

  interactObject(objectId: string): boolean {
    const unit = this.activeUnit;
    const object = this.objects.find((candidate) => candidate.id === objectId);
    if (!unit || unit.team !== 'heroes' || !object?.active || !unit.actionAvailable) return false;
    if (distance(unit, object) > 1) return false;
    object.active = false;
    unit.actionAvailable = false;
    this.moveUndo = null;
    this.selectedAbilityId = null;
    this.addEvent(
      'objective',
      text(`${unit.name['zh-CN']}熄灭了${object.name['zh-CN']}`, `${unit.name['en-US']} disabled ${object.name['en-US']}`),
      { sourceId: unit.id, objectId: object.id },
    );
    return true;
  }

  endTurn(): void {
    if (this.outcome !== 'playing') return;
    this.selectedAbilityId = null;
    this.moveUndo = null;
    this.advanceTurn();
  }

  runEnemyTurn(): void {
    const enemy = this.activeUnit;
    if (!enemy || enemy.team !== 'enemies' || this.outcome !== 'playing') return;
    this.moveUndo = null;
    const heroes = this.units.filter((unit) => unit.team === 'heroes' && unit.hp > 0);
    if (!heroes.length) {
      this.checkOutcome();
      return;
    }
    const target = heroes.sort((a, b) => distance(enemy, a) - distance(enemy, b) || a.hp - b.hp)[0];
    const available = enemy.abilities.filter((ability) => this.canPay(enemy, ability));
    let chosen = available.find(
      (ability) => ability.tags?.includes('area') && distance(enemy, target) <= ability.range && (enemy.resources.flare ?? 0) > 0,
    );
    chosen ??= available.find((ability) => ability.target === 'enemy' && distance(enemy, target) <= ability.range);

    if (!chosen) {
      this.moveEnemyToward(enemy, target);
      chosen = available.find((ability) => ability.target === 'enemy' && distance(enemy, target) <= ability.range);
    }
    if (chosen) this.resolveAbility(enemy, chosen, target);
    this.advanceTurn();
  }

  private resetActiveUnit(): void {
    const unit = this.activeUnit;
    if (!unit) return;
    unit.actionAvailable = true;
    unit.bonusAvailable = true;
    unit.moveRemaining = unit.speed;
    unit.reactionAvailable = true;
    unit.sneakAttackUsed = false;
    if (hasStatus(unit, 'prone')) unit.statuses = unit.statuses.filter((status) => status !== 'prone');
    this.addEvent('turn', text(`${unit.name['zh-CN']}的回合`, `${unit.name['en-US']}'s turn`));
  }

  private advanceTurn(): void {
    if (this.outcome !== 'playing') return;
    this.moveUndo = null;
    let attempts = 0;
    do {
      this.turnIndex += 1;
      if (this.turnIndex >= this.turnOrder.length) {
        this.turnIndex = 0;
        this.round += 1;
      }
      attempts += 1;
    } while ((!this.activeUnit || this.activeUnit.hp <= 0) && attempts <= this.turnOrder.length + 1);
    this.resetActiveUnit();
  }

  private canPay(unit: BattleUnitState, ability: AbilityDefinition): boolean {
    if (ability.cost === 'action' && !unit.actionAvailable) return false;
    if (ability.cost === 'bonus' && !unit.bonusAvailable) return false;
    if (ability.resourceCost && (unit.resources[ability.resourceCost.key] ?? 0) < ability.resourceCost.amount) return false;
    if (ability.utility === 'action-surge' && unit.actionAvailable) return false;
    return true;
  }

  private pay(unit: BattleUnitState, ability: AbilityDefinition): void {
    if (ability.cost === 'action') unit.actionAvailable = false;
    if (ability.cost === 'bonus') unit.bonusAvailable = false;
    if (ability.resourceCost) {
      unit.resources[ability.resourceCost.key] = (unit.resources[ability.resourceCost.key] ?? 0) - ability.resourceCost.amount;
    }
  }

  private resolveAbility(unit: BattleUnitState, ability: AbilityDefinition, target: BattleUnitState): boolean {
    if (!this.canPay(unit, ability) || distance(unit, target) > ability.range) return false;
    this.moveUndo = null;
    this.pay(unit, ability);

    if (ability.utility === 'action-surge') {
      unit.actionAvailable = true;
      this.addEvent('system', text(`${unit.name['zh-CN']}发动动作如潮`, `${unit.name['en-US']} uses Action Surge`));
      return true;
    }
    if (ability.utility === 'steady-aim') {
      unit.moveRemaining = 0;
      this.addStatus(unit, 'advantage-next');
      this.addEvent('system', text(`${unit.name['zh-CN']}稳住准星`, `${unit.name['en-US']} takes Steady Aim`));
      return true;
    }
    if (ability.utility === 'hide') {
      if (this.units.some((candidate) => candidate.team !== unit.team && candidate.hp > 0 && distance(candidate, unit) <= 1)) {
        unit.bonusAvailable = true;
        return false;
      }
      this.addStatus(unit, 'hidden');
      this.addStatus(unit, 'advantage-next');
      this.addEvent('system', text(`${unit.name['zh-CN']}隐入阴影`, `${unit.name['en-US']} slips into hiding`));
      return true;
    }
    if (ability.kind === 'heal' && ability.healing) {
      const amount = rollDice(ability.healing.dice, this.rng, ability.healing.bonus ?? 0);
      target.hp = Math.min(target.maxHp, target.hp + amount);
      this.addEvent(
        'heal',
        text(`${target.name['zh-CN']}恢复${amount}点生命`, `${target.name['en-US']} restores ${amount} HP`),
        { sourceId: unit.id, targetId: target.id, abilityId: ability.id, amount },
      );
      return true;
    }

    if (!ability.damage) return true;
    if (ability.kind === 'auto-damage') {
      const amount = rollDice(ability.damage.dice, this.rng, ability.damage.bonus ?? 0);
      this.applyDamage(target, amount, unit, ability);
      return true;
    }

    if (ability.kind === 'save' && ability.save) {
      const saveBonus = target.saves[ability.save.ability] ?? 0;
      const save = rollD20(this.rng, saveBonus);
      const success = !save.natural1 && (save.natural20 || save.total >= ability.save.dc);
      let amount = rollDice(ability.damage.dice, this.rng, ability.damage.bonus ?? 0);
      if (success && ability.damage.halfOnSave) amount = Math.floor(amount / 2);
      if (success && !ability.damage.halfOnSave) amount = 0;
      this.addEvent(
        'roll',
        text(
          `${target.name['zh-CN']}豁免：${save.chosen}+${save.modifier}=${save.total} / DC ${ability.save.dc}`,
          `${target.name['en-US']} save: ${save.chosen}+${save.modifier}=${save.total} / DC ${ability.save.dc}`,
        ),
        {
          sourceId: target.id,
          targetId: target.id,
          abilityId: ability.id,
          rolls: save.rolls,
          chosen: save.chosen,
          modifier: save.modifier,
          total: save.total,
          targetNumber: ability.save.dc,
          rollMode: 'save',
          success,
        },
      );
      this.applyDamage(target, amount, unit, ability);
      if (!success && ability.push) this.pushAway(unit, target, ability.push);
      return true;
    }

    this.resolveAttack(unit, target, ability);
    return true;
  }

  private resolveAttack(unit: BattleUnitState, target: BattleUnitState, ability: AbilityDefinition, opportunity = false): void {
    const { advantage, disadvantage, attackBonus, armorClass, allyAdjacent } = this.getAttackContext(unit, target, ability);
    const roll = rollD20(this.rng, attackBonus, advantage, disadvantage);
    const hit = attackHits(roll, armorClass);
    this.addEvent(
      'roll',
      text(
        `${unit.name['zh-CN']}攻击：${roll.rolls.join('/')}+${roll.modifier}=${roll.total} / AC ${armorClass}`,
        `${unit.name['en-US']} attacks: ${roll.rolls.join('/')}+${roll.modifier}=${roll.total} / AC ${armorClass}`,
      ),
      {
        sourceId: unit.id,
        targetId: target.id,
        abilityId: ability.id,
        rolls: roll.rolls,
        chosen: roll.chosen,
        modifier: roll.modifier,
        total: roll.total,
        targetNumber: armorClass,
        rollMode: 'attack',
        advantage,
        disadvantage,
        success: hit,
      },
    );
    if (hit) {
      let amount = rollDice(ability.damage!.dice, this.rng, ability.damage!.bonus ?? 0, roll.natural20);
      const sneakAttack =
        unit.tags.includes('sneak-attack') && !unit.sneakAttackUsed && (advantage || allyAdjacent) && !disadvantage;
      if (sneakAttack) {
        amount += rollDice('2d6', this.rng, 0, roll.natural20);
        unit.sneakAttackUsed = true;
      }
      this.applyDamage(target, amount, unit, ability, roll.natural20, sneakAttack);
      if (ability.push) this.pushAway(unit, target, ability.push);
    } else if (ability.damage?.halfOnMiss) {
      const amount = Math.floor(rollDice(ability.damage.dice, this.rng, ability.damage.bonus ?? 0) / 2);
      this.applyDamage(target, amount, unit, ability);
    } else {
      this.addEvent(
        'system',
        text(`${unit.name['zh-CN']}的攻击落空`, `${unit.name['en-US']}'s attack misses`),
        { sourceId: unit.id, targetId: target.id, abilityId: ability.id, missed: true },
      );
    }
    if (!opportunity) unit.statuses = unit.statuses.filter((status) => status !== 'advantage-next' && status !== 'hidden');
  }

  private getAttackContext(unit: BattleUnitState, target: BattleUnitState, ability: AbilityDefinition) {
    const melee = ability.range <= 1;
    const allyAdjacent = this.units.some(
      (candidate) => candidate.team === unit.team && candidate.id !== unit.id && candidate.hp > 0 && distance(candidate, target) <= 1,
    );
    const advantage =
      hasStatus(unit, 'advantage-next') || hasStatus(unit, 'hidden') || (melee && hasStatus(target, 'prone')) ||
      (unit.tags.includes('pack-tactics') && allyAdjacent);
    const disadvantage = hasStatus(unit, 'prone') || (!melee && hasStatus(target, 'prone'));
    const attackBonus = (ability.attackBonus ?? 0) + (unit.team === 'enemies' && this.veteran ? 1 : 0);
    const coverBonus = !melee && this.terrainMap.get(`${target.x},${target.y}`) === 'cover' ? 2 : 0;
    const pylonBonus =
      target.id === this.definition.bossUnitId ? this.objects.filter((object) => object.kind === 'pylon' && object.active).length : 0;
    const armorClass = target.ac + coverBonus + pylonBonus + (hasStatus(target, 'guarded') ? 2 : 0);
    return { advantage, disadvantage, attackBonus, armorClass, allyAdjacent };
  }

  private applyDamage(
    target: BattleUnitState,
    amount: number,
    source: BattleUnitState,
    ability: AbilityDefinition,
    critical = false,
    sneakAttack = false,
  ): void {
    const finalAmount = Math.max(0, amount);
    target.hp = Math.max(0, target.hp - finalAmount);
    const extraZh = `${critical ? '，暴击' : ''}${sneakAttack ? '，偷袭' : ''}`;
    const extraEn = `${critical ? ', critical' : ''}${sneakAttack ? ', sneak attack' : ''}`;
    this.addEvent(
      'damage',
      text(
        `${source.name['zh-CN']}以${ability.name['zh-CN']}造成${finalAmount}点伤害${extraZh}`,
        `${source.name['en-US']} deals ${finalAmount} damage with ${ability.name['en-US']}${extraEn}`,
      ),
      {
        sourceId: source.id,
        targetId: target.id,
        abilityId: ability.id,
        amount: finalAmount,
        critical,
        sneakAttack,
      },
    );
    if (target.hp === 0) this.addEvent('system', text(`${target.name['zh-CN']}倒下了`, `${target.name['en-US']} is down`));
    this.checkOutcome();
  }

  private resolveOpportunityAttacks(mover: BattleUnitState, origin: { x: number; y: number }): void {
    for (const enemy of this.units.filter(
      (candidate) => candidate.team !== mover.team && candidate.hp > 0 && candidate.reactionAvailable,
    )) {
      if (distance(enemy, origin) <= 1 && distance(enemy, mover) > 1) {
        const attack = enemy.abilities.find((ability) => ability.kind === 'attack' && ability.range <= 1);
        if (attack) {
          enemy.reactionAvailable = false;
          this.addEvent('system', text(`${enemy.name['zh-CN']}发动借机攻击`, `${enemy.name['en-US']} makes an opportunity attack`));
          this.resolveAttack(enemy, mover, attack, true);
        }
      }
    }
  }

  private moveEnemyToward(enemy: BattleUnitState, target: BattleUnitState): void {
    const origin = { x: enemy.x, y: enemy.y };
    let remaining = enemy.moveRemaining;
    while (remaining > 0 && distance(enemy, target) > 1) {
      const candidates = [
        { x: enemy.x + 1, y: enemy.y },
        { x: enemy.x - 1, y: enemy.y },
        { x: enemy.x, y: enemy.y + 1 },
        { x: enemy.x, y: enemy.y - 1 },
      ]
        .filter((cell) => this.canOccupy(cell.x, cell.y, enemy.id))
        .sort((a, b) => distance(a, target) - distance(b, target));
      if (!candidates.length || distance(candidates[0], target) >= distance(enemy, target)) break;
      enemy.x = candidates[0].x;
      enemy.y = candidates[0].y;
      remaining -= this.terrainMap.get(`${enemy.x},${enemy.y}`) === 'difficult' ? 2 : 1;
    }
    enemy.moveRemaining = Math.max(0, remaining);
    if (origin.x !== enemy.x || origin.y !== enemy.y) {
      this.addEvent('move', text(`${enemy.name['zh-CN']}逼近目标`, `${enemy.name['en-US']} closes in`));
      this.resolveOpportunityAttacks(enemy, origin);
    }
  }

  private pushAway(source: BattleUnitState, target: BattleUnitState, spaces: number): void {
    const dx = Math.sign(target.x - source.x);
    const dy = dx === 0 ? Math.sign(target.y - source.y) : 0;
    let moved = 0;
    for (let index = 0; index < spaces; index += 1) {
      const nextX = target.x + dx;
      const nextY = target.y + dy;
      if (!this.canOccupy(nextX, nextY, target.id)) break;
      target.x = nextX;
      target.y = nextY;
      moved += 1;
    }
    if (moved) this.addEvent('move', text(`${target.name['zh-CN']}被推开${moved}格`, `${target.name['en-US']} is pushed ${moved} spaces`));
  }

  private getEnemyIntents(): EnemyIntent[] {
    const heroes = this.units.filter((unit) => unit.team === 'heroes' && unit.hp > 0);
    if (!heroes.length) return [];
    return this.units.filter((unit) => unit.team === 'enemies' && unit.hp > 0).map((enemy) => {
      const target = [...heroes].sort((a, b) => distance(enemy, a) - distance(enemy, b) || a.hp - b.hp)[0];
      const available = enemy.abilities.filter((ability) => ability.target === 'enemy' && this.canPay(enemy, ability));
      let chosen = available.find(
        (ability) => ability.tags?.includes('area') && distance(enemy, target) <= ability.range && (enemy.resources.flare ?? 0) > 0,
      );
      chosen ??= available.find((ability) => distance(enemy, target) <= ability.range);
      chosen ??= [...available].sort((a, b) => b.range - a.range)[0];
      const kind: EnemyIntent['kind'] = chosen && distance(enemy, target) <= chosen.range ? 'attack' : 'advance';
      return {
        unitId: enemy.id,
        targetId: target.id,
        abilityId: chosen?.id ?? null,
        kind,
        estimatedDamage: chosen?.damage ? `${chosen.damage.dice}${chosen.damage.bonus ? `+${chosen.damage.bonus}` : ''}` : null,
      };
    });
  }

  private getTargetPreviews(): TargetPreview[] {
    const unit = this.activeUnit;
    if (!unit || unit.team !== 'heroes' || !this.selectedAbilityId) return [];
    const ability = unit.abilities.find((candidate) => candidate.id === this.selectedAbilityId);
    if (!ability || ability.target !== 'enemy') return [];
    const range = this.getDamageRange(ability);
    return this.units.filter((target) => target.team !== unit.team && target.hp > 0).map((target) => {
      const inRange = distance(unit, target) <= ability.range;
      let chance: number | null = null;
      let targetNumber: number | null = null;
      let rollMode: TargetPreview['rollMode'] = null;
      let advantage = false;
      let disadvantage = false;
      if (ability.kind === 'attack') {
        const context = this.getAttackContext(unit, target, ability);
        advantage = context.advantage;
        disadvantage = context.disadvantage;
        targetNumber = context.armorClass;
        rollMode = 'attack';
        chance = this.getD20Chance(context.attackBonus, context.armorClass, advantage, disadvantage);
      } else if (ability.kind === 'save' && ability.save) {
        targetNumber = ability.save.dc;
        rollMode = 'save';
        const saveChance = this.getD20Chance(target.saves[ability.save.ability] ?? 0, ability.save.dc, false, false);
        chance = 100 - saveChance;
      } else if (ability.kind === 'auto-damage') {
        chance = 100;
        rollMode = 'automatic';
      }
      return {
        targetId: target.id,
        inRange,
        chance,
        minDamage: range?.min ?? null,
        maxDamage: range?.max ?? null,
        targetNumber,
        rollMode,
        advantage,
        disadvantage,
      };
    });
  }

  private getD20Chance(modifier: number, target: number, advantage: boolean, disadvantage: boolean): number {
    let successes = 0;
    for (let roll = 1; roll <= 20; roll += 1) {
      if (roll !== 1 && (roll === 20 || roll + modifier >= target)) successes += 1;
    }
    const base = successes / 20;
    const probability = advantage === disadvantage ? base : advantage ? 1 - (1 - base) ** 2 : base ** 2;
    return Math.round(probability * 100);
  }

  private getDamageRange(ability: AbilityDefinition): { min: number; max: number } | null {
    if (!ability.damage) return null;
    const match = /^(\d+)d(\d+)$/.exec(ability.damage.dice);
    if (!match) return null;
    const count = Number(match[1]);
    const sides = Number(match[2]);
    const bonus = ability.damage.bonus ?? 0;
    return { min: Math.max(0, count + bonus), max: Math.max(0, count * sides + bonus) };
  }

  private addStatus(unit: BattleUnitState, status: StatusId): void {
    if (!unit.statuses.includes(status)) unit.statuses.push(status);
  }

  private checkOutcome(): void {
    if (!this.units.some((unit) => unit.team === 'enemies' && unit.hp > 0)) this.outcome = 'victory';
    if (!this.units.some((unit) => unit.team === 'heroes' && unit.hp > 0)) this.outcome = 'defeat';
  }

  private canOccupy(x: number, y: number, movingUnitId: string): boolean {
    if (x < 0 || y < 0 || x >= this.definition.width || y >= this.definition.height) return false;
    if (this.terrainMap.get(`${x},${y}`) === 'blocked') return false;
    if (this.units.some((unit) => unit.id !== movingUnitId && unit.hp > 0 && unit.x === x && unit.y === y)) return false;
    if (this.objects.some((object) => object.active && object.x === x && object.y === y)) return false;
    return true;
  }

  private getReachableCells(unitId: string): Array<{ x: number; y: number }> {
    const unit = this.units.find((candidate) => candidate.id === unitId);
    if (!unit) return [];
    return [...this.computeReachable(unit).entries()]
      .filter(([, cost]) => cost > 0 && cost <= unit.moveRemaining)
      .map(([key]) => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
      });
  }

  private computeReachable(unit: BattleUnitState): Map<string, number> {
    const distances = new Map<string, number>([[`${unit.x},${unit.y}`, 0]]);
    const frontier = [{ x: unit.x, y: unit.y, cost: 0 }];
    while (frontier.length) {
      frontier.sort((a, b) => a.cost - b.cost);
      const current = frontier.shift()!;
      for (const next of [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ]) {
        if (!this.canOccupy(next.x, next.y, unit.id)) continue;
        const step = this.terrainMap.get(`${next.x},${next.y}`) === 'difficult' ? 2 : 1;
        const nextCost = current.cost + step;
        const key = `${next.x},${next.y}`;
        if (nextCost <= unit.moveRemaining && nextCost < (distances.get(key) ?? Number.POSITIVE_INFINITY)) {
          distances.set(key, nextCost);
          frontier.push({ ...next, cost: nextCost });
        }
      }
    }
    return distances;
  }

  private addEvent(type: BattleEvent['type'], eventText: LocalizedText, meta?: BattleEvent['meta']): void {
    this.events.push({ id: ++this.eventId, type, text: eventText, meta });
    this.events = this.events.slice(-10);
  }
}
