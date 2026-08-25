import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import heroTriptychUrl from '../assets/hero-triptych.png';
import { BattleBoard, type BattleBoardHandle } from './BattleBoard';
import { localize, uiCopy } from '../game/i18n';
import { track } from '../game/profile';
import type {
  BattleDefinition,
  BattleSnapshot,
  ContentPack,
  Locale,
  UnitPersistentState,
} from '../game/types';
import type { BattleRuntimeOptions } from '../game/battleRuntime';

interface BattleScreenProps {
  pack: ContentPack;
  battle: BattleDefinition;
  locale: Locale;
  soundEnabled: boolean;
  seed: number;
  options: BattleRuntimeOptions;
  onVictory: (party: Record<string, UnitPersistentState>) => void;
}

function resourceLabel(key: string, locale: Locale): string {
  const labels: Record<string, { 'zh-CN': string; 'en-US': string }> = {
    secondWind: { 'zh-CN': '第二风', 'en-US': 'Second Wind' },
    actionSurge: { 'zh-CN': '动作如潮', 'en-US': 'Action Surge' },
    slot1: { 'zh-CN': '一环位', 'en-US': 'Lv.1 slots' },
    slot2: { 'zh-CN': '二环位', 'en-US': 'Lv.2 slots' },
    potion: { 'zh-CN': '药剂', 'en-US': 'Potions' },
    flare: { 'zh-CN': '闪焰', 'en-US': 'Flares' },
  };
  return labels[key]?.[locale] ?? key;
}

export function BattleScreen({ pack, battle, locale, soundEnabled, seed, options, onVictory }: BattleScreenProps) {
  const boardRef = useRef<BattleBoardHandle>(null);
  const [snapshot, setSnapshot] = useState<BattleSnapshot | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.6>(1);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const copy = uiCopy[locale];
  const active = snapshot?.units.find((unit) => unit.id === snapshot.activeUnitId) ?? null;
  const heroes = snapshot?.units.filter((unit) => unit.team === 'heroes') ?? [];
  const boss = snapshot?.units.find((unit) => unit.tags.includes('boss')) ?? null;
  const activePylons = snapshot?.objects.filter((object) => object.kind === 'pylon' && object.active).length ?? 0;
  const aliveEnemies = snapshot?.units.filter((unit) => unit.team === 'enemies' && unit.hp > 0).length ?? battle.enemies.length;
  const isDefeat = snapshot?.outcome === 'defeat';
  const selectedAbility = active?.abilities.find((ability) => ability.id === snapshot?.selectedAbilityId) ?? null;
  const validTargetCount = snapshot?.targetPreviews.filter((preview) => preview.inRange).length ?? 0;
  const suggestedAbilityId = !snapshot?.selectedAbilityId && active?.team === 'heroes'
    ? active.abilities.find((ability) => ability.target === 'enemy' && (ability.cost !== 'action' || active.actionAvailable) && (ability.cost !== 'bonus' || active.bonusAvailable))?.id ?? null
    : null;
  const hasPlayerRoll = snapshot?.events.some((event) => event.type === 'roll' && heroes.some((hero) => hero.id === event.meta?.sourceId)) ?? false;
  const stableOptions = useMemo(
    () => ({
      veteran: options.veteran,
      initialAdvantage: options.initialAdvantage,
      inactiveObjectIds: options.inactiveObjectIds,
      party: options.party,
    }),
    [options.inactiveObjectIds, options.initialAdvantage, options.party, options.veteran],
  );
  const handleSnapshot = useCallback((next: BattleSnapshot) => setSnapshot(next), []);
  const handleVictory = useCallback((party: Record<string, UnitPersistentState>) => onVictory(party), [onVictory]);

  useEffect(() => {
    boardRef.current?.setSpeed(speed);
  }, [attempt, snapshot?.battleId, speed]);

  const abilityAvailable = (abilityId: string): boolean => {
    if (!active || active.team !== 'heroes') return false;
    const ability = active.abilities.find((candidate) => candidate.id === abilityId);
    if (!ability) return false;
    if (ability.cost === 'action' && !active.actionAvailable) return false;
    if (ability.cost === 'bonus' && !active.bonusAvailable) return false;
    if (ability.resourceCost && (active.resources[ability.resourceCost.key] ?? 0) < ability.resourceCost.amount) return false;
    if (ability.utility === 'action-surge' && active.actionAvailable) return false;
    return true;
  };

  return (
    <section className="battle-screen">
      <header className="battle-header">
        <div>
          <span className="eyebrow">{localize(battle.name, locale)}</span>
          <h2>{localize(battle.objective, locale)}</h2>
        </div>
        <div className="battle-header-controls">
          <span className="enemy-counter">{locale === 'zh-CN' ? '剩余敌人' : 'ENEMIES'} <b>{aliveEnemies}</b></span>
          <button className="speed-toggle" onClick={() => setSpeed((current) => {
            const next = current === 1 ? 1.6 : 1;
            track('battle_speed_changed', { battleId: battle.id, speed: next });
            return next;
          })}>{speed === 1 ? '1×' : '1.6×'} <small>{locale === 'zh-CN' ? '战斗速度' : 'SPEED'}</small></button>
          <div className="round-badge">{copy.round} {snapshot?.round ?? 1}</div>
        </div>
      </header>

      {boss && (
        <div className="boss-status-bar">
          <div className="boss-status-title">
            <span>☩</span>
            <div><small>{locale === 'zh-CN' ? '仪式首领' : 'RITUAL BOSS'}</small><strong>{localize(boss.name, locale)}</strong></div>
          </div>
          <div className="boss-health"><span style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} /></div>
          <div className="boss-status-meta"><b>{boss.hp}/{boss.maxHp}</b><span>{locale === 'zh-CN' ? `仪式柱 ${activePylons}` : `PYLONS ${activePylons}`}</span></div>
        </div>
      )}

      <div className="battle-layout">
        <div className="board-wrap">
          <BattleBoard
            key={`${battle.id}-${attempt}`}
            ref={boardRef}
            pack={pack}
            battle={battle}
            seed={seed + attempt * 101}
            locale={locale}
            options={stableOptions}
            soundEnabled={soundEnabled}
            onSnapshot={handleSnapshot}
            onVictory={handleVictory}
          />
          <p className={`board-help ${selectedAbility && validTargetCount === 0 ? 'warning' : ''}`}>{selectedAbility
            ? validTargetCount > 0
              ? (locale === 'zh-CN' ? '点击带概率标签的敌人执行技能；再次点击技能可以取消选择。' : 'Click an enemy with an odds label to act; click the ability again to cancel.')
              : (locale === 'zh-CN' ? '当前没有射程内目标。直接点击绿色格移动，技能选择会保留。' : 'No target is in range. Click a green tile to move; the ability stays selected.')
            : (locale === 'zh-CN' ? '敌人头顶显示下一步意图。点击绿色格移动，移动后可以撤销。' : 'Enemy intent appears above each foe. Click a green tile to move; movement can be undone.')}</p>
        </div>

        <aside className="battle-sidebar">
          <div className="initiative-strip">
            {snapshot?.units.filter((unit) => unit.hp > 0).map((unit) => (
              <div key={unit.id} className={`initiative-token ${unit.id === snapshot.activeUnitId ? 'active' : ''} ${unit.team}`}>
                {localize(unit.name, locale).slice(0, 1)}
              </div>
            ))}
          </div>

          {battle.id === 'outer-ward' && !coachDismissed && active?.team === 'heroes' && (
            <div className="flow-coach">
              <span className="coach-mark">DM</span>
              <div>
                <small>{locale === 'zh-CN' ? '战术提示' : 'TACTICAL NOTE'}</small>
                <strong>{selectedAbility
                  ? validTargetCount > 0
                    ? (locale === 'zh-CN' ? '绿色概率标签代表合法目标。点击目标后会先掷d20，再播放攻击。' : 'A green odds label marks a valid target. Click it to roll the d20 before the attack.')
                    : (locale === 'zh-CN' ? '该技能暂时没有合法目标。直接点击绿色格移动，系统会保留技能选择和动作。' : 'This ability has no valid target yet. Move on a green tile; the selection and action remain available.')
                  : !hasPlayerRoll
                    ? (locale === 'zh-CN' ? '先选择一项攻击。敌人头顶会显示命中率与伤害范围。' : 'Choose an attack. Valid targets will show hit chance and damage.')
                  : active.actionAvailable
                    ? (locale === 'zh-CN' ? '先看敌方意图，再决定移动、攻击或使用附赠动作。' : 'Read enemy intent, then choose movement, attack, or a bonus action.')
                    : (locale === 'zh-CN' ? '主要动作已完成。你仍可移动、使用附赠动作或结束回合。' : 'Your action is spent. You can still move, use a bonus action, or end the turn.')}</strong>
              </div>
              <button onClick={() => setCoachDismissed(true)} aria-label={locale === 'zh-CN' ? '关闭提示' : 'Dismiss tip'}>×</button>
            </div>
          )}

          <div className="hero-status-list">
            {heroes.map((hero) => (
              <div key={hero.id} className={`hero-status ${hero.id === snapshot?.activeUnitId ? 'active' : ''}`}>
                <div className="hero-status-main">
                  <span
                    className={`hero-avatar ${hero.templateId}`}
                    style={{ backgroundImage: `url(${heroTriptychUrl})` }}
                  />
                  <div className="hero-status-copy">
                    <div className="hero-status-top">
                      <strong>{localize(hero.name, locale)}</strong>
                      <span>{hero.hp}/{hero.maxHp}</span>
                    </div>
                    <div className="hp-track"><span style={{ width: `${(hero.hp / hero.maxHp) * 100}%` }} /></div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="active-unit-panel">
            <span className="eyebrow">{active?.team === 'heroes' ? copy.selectAbility : '敌方行动 / Enemy turn'}</span>
            <h3>{active ? localize(active.name, locale) : '—'}</h3>
            {active?.team === 'heroes' && (
              <>
                <div className="action-economy" aria-label={locale === 'zh-CN' ? '本回合行动资源' : 'Turn resources'}>
                  <span className={active.moveRemaining > 0 ? 'available' : 'spent'}><b>↠</b><small>{locale === 'zh-CN' ? '移动' : 'MOVE'}</small><strong>{active.moveRemaining}/{active.speed}</strong></span>
                  <span className={active.actionAvailable ? 'available' : 'spent'}><b>◆</b><small>{locale === 'zh-CN' ? '动作' : 'ACTION'}</small><strong>{active.actionAvailable ? '1' : '0'}</strong></span>
                  <span className={active.bonusAvailable ? 'available' : 'spent'}><b>◇</b><small>{locale === 'zh-CN' ? '附赠' : 'BONUS'}</small><strong>{active.bonusAvailable ? '1' : '0'}</strong></span>
                  <span className={active.reactionAvailable ? 'available' : 'spent'}><b>↶</b><small>{locale === 'zh-CN' ? '反应' : 'REACTION'}</small><strong>{active.reactionAvailable ? '1' : '0'}</strong></span>
                </div>
                <div className="resource-row">
                  {Object.entries(active.resources).map(([key, value]) => (
                    <span key={key}>{resourceLabel(key, locale)} {value}</span>
                  ))}
                </div>
                <div className="ability-grid">
                  {active.abilities.map((ability) => (
                    <button
                      key={ability.id}
                      className={`ability-button ${snapshot?.selectedAbilityId === ability.id ? 'selected' : ''} ${suggestedAbilityId === ability.id ? 'suggested' : ''}`}
                      disabled={!abilityAvailable(ability.id)}
                      onClick={() => boardRef.current?.selectAbility(ability.id)}
                      title={localize(ability.description, locale)}
                    >
                      <span>{localize(ability.name, locale)}</span>
                      <small>{copy[ability.cost]}</small>
                    </button>
                  ))}
                </div>
                {selectedAbility && (
                  <div className="ability-detail">
                    <div><strong>{localize(selectedAbility.name, locale)}</strong><span>{selectedAbility.range <= 1 ? (locale === 'zh-CN' ? '近战' : 'MELEE') : `${locale === 'zh-CN' ? '射程' : 'RANGE'} ${selectedAbility.range}`}</span></div>
                    <p>{localize(selectedAbility.description, locale)}</p>
                    <small>{selectedAbility.damage ? `${selectedAbility.damage.dice}${selectedAbility.damage.bonus ? `+${selectedAbility.damage.bonus}` : ''} ${selectedAbility.damage.type}` : locale === 'zh-CN' ? '辅助能力' : 'UTILITY'}</small>
                  </div>
                )}
                <div className="turn-actions">
                  <button className="undo-move" disabled={!snapshot?.canUndoMove} onClick={() => boardRef.current?.undoMove()}>↶ {locale === 'zh-CN' ? '撤销移动' : 'Undo move'}</button>
                  <button className={`end-turn ${!active.actionAvailable ? 'ready' : ''}`} onClick={() => boardRef.current?.endTurn()}>{copy.endTurn}</button>
                </div>
              </>
            )}
          </div>

          <div className="combat-log">
            <span className="eyebrow">D20 LOG</span>
            <div className="log-scroll">
              {snapshot?.events.slice().reverse().map((event) => (
                <p key={event.id} className={event.type}>{localize(event.text, locale)}</p>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {isDefeat && (
        <div className="battle-overlay">
          <div className="overlay-card">
            <span className="eyebrow">TOTAL PARTY KNOCKOUT</span>
            <h2>{copy.defeat}</h2>
            <p>{locale === 'zh-CN' ? '保持当前故事选择，重新挑战这场战斗。' : 'Keep your story choices and retry this battle.'}</p>
            <button className="primary-button" onClick={() => { setSnapshot(null); setAttempt((value) => value + 1); }}>{copy.restart}</button>
          </div>
        </div>
      )}
    </section>
  );
}
