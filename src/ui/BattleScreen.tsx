import { useCallback, useMemo, useRef, useState } from 'react';
import heroTriptychUrl from '../assets/hero-triptych.png';
import { BattleBoard, type BattleBoardHandle } from './BattleBoard';
import { localize, uiCopy } from '../game/i18n';
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
  const copy = uiCopy[locale];
  const active = snapshot?.units.find((unit) => unit.id === snapshot.activeUnitId) ?? null;
  const heroes = snapshot?.units.filter((unit) => unit.team === 'heroes') ?? [];
  const boss = snapshot?.units.find((unit) => unit.tags.includes('boss')) ?? null;
  const activePylons = snapshot?.objects.filter((object) => object.kind === 'pylon' && object.active).length ?? 0;
  const isDefeat = snapshot?.outcome === 'defeat';
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
        <div className="round-badge">{copy.round} {snapshot?.round ?? 1}</div>
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
          <p className="board-help">{copy.moveHint}</p>
        </div>

        <aside className="battle-sidebar">
          <div className="initiative-strip">
            {snapshot?.units.filter((unit) => unit.hp > 0).map((unit) => (
              <div key={unit.id} className={`initiative-token ${unit.id === snapshot.activeUnitId ? 'active' : ''} ${unit.team}`}>
                {localize(unit.name, locale).slice(0, 1)}
              </div>
            ))}
          </div>

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
                <div className="resource-row">
                  {Object.entries(active.resources).map(([key, value]) => (
                    <span key={key}>{resourceLabel(key, locale)} {value}</span>
                  ))}
                </div>
                <div className="ability-grid">
                  {active.abilities.map((ability) => (
                    <button
                      key={ability.id}
                      className={`ability-button ${snapshot?.selectedAbilityId === ability.id ? 'selected' : ''}`}
                      disabled={!abilityAvailable(ability.id)}
                      onClick={() => boardRef.current?.selectAbility(ability.id)}
                      title={localize(ability.description, locale)}
                    >
                      <span>{localize(ability.name, locale)}</span>
                      <small>{copy[ability.cost]}</small>
                    </button>
                  ))}
                </div>
                <button className="end-turn" onClick={() => boardRef.current?.endTurn()}>{copy.endTurn}</button>
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
