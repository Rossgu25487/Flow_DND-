import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import bossWardenUrl from '../assets/boss-warden.png';
import heroTriptychUrl from '../assets/hero-triptych.png';
import keyArtUrl from '../assets/key-art.png';
import { ashenBeaconPack } from '../content/ashenBeacon';
import { fixturePack } from '../content/fixturePack';
import { emberAudio } from '../game/audio';
import { emberNarrator } from '../game/narrator';
import { validateContentPack } from '../game/contentValidator';
import { localize, uiCopy } from '../game/i18n';
import { defaultProfile, loadProfile, saveProfile, setProfileLocale, track } from '../game/profile';
import { SeededRng } from '../game/rng';
import { rollD20, type D20Result } from '../game/rules';
import type {
  Locale,
  PlayerProfile,
  StoryChoice,
  StoryEffect,
  UnitPersistentState,
} from '../game/types';
import { DiceCheckOverlay } from './DiceCheckOverlay';

const BattleScreen = lazy(() => import('./BattleScreen').then((module) => ({ default: module.BattleScreen })));

type HomeSection = 'contracts' | 'roster' | 'codex' | 'settings';
type Difficulty = 'explorer' | 'veteran';

interface PendingCheck {
  choice: StoryChoice;
  result: D20Result;
  success: boolean;
}

const pack = ashenBeaconPack;
const contract = pack.contracts[0];

function createInitialParty(): Record<string, UnitPersistentState> {
  return Object.fromEntries(
    pack.units
      .filter((unit) => unit.team === 'heroes')
      .map((unit) => [
        unit.id,
        { templateId: unit.id, hp: unit.maxHp, resources: { ...(unit.resources ?? {}) } },
      ]),
  );
}

function localeToggle(profile: PlayerProfile): Locale {
  return profile.locale === 'zh-CN' ? 'en-US' : 'zh-CN';
}

export function App() {
  const [profile, setProfile] = useState<PlayerProfile>(() => {
    if (typeof localStorage === 'undefined') return defaultProfile;
    return loadProfile();
  });
  const [homeSection, setHomeSection] = useState<HomeSection>('contracts');
  const [inRun, setInRun] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('explorer');
  const [nodeId, setNodeId] = useState(contract.startNodeId);
  const [party, setParty] = useState<Record<string, UnitPersistentState>>(createInitialParty);
  const [flags, setFlags] = useState<Record<string, boolean | string | number>>({});
  const [runRenown, setRunRenown] = useState(0);
  const [runSeed, setRunSeed] = useState(() => Date.now() % 1_000_000);
  const [pendingCheck, setPendingCheck] = useState<PendingCheck | null>(null);
  const [interestRecorded, setInterestRecorded] = useState(false);
  const [signingMode, setSigningMode] = useState<'start' | 'edit' | null>(null);
  const [draftName, setDraftName] = useState(profile.playerName);
  const [narrating, setNarrating] = useState(false);
  const rngRef = useRef(new SeededRng(runSeed));
  const completedEndingRef = useRef<string | null>(null);
  const locale = profile.locale;
  const copy = uiCopy[locale];
  const validation = useMemo(() => [validateContentPack(pack), validateContentPack(fixturePack)], []);
  const validationErrors = validation.flatMap((result) => result.errors);
  const currentNode = contract.story.find((node) => node.id === nodeId);
  const narrationText = currentNode && currentNode.type !== 'battle'
    ? [
        currentNode.id === contract.startNodeId && profile.playerName
          ? (locale === 'zh-CN' ? `契约者${profile.playerName}。` : `Contract-bearer ${profile.playerName}.`)
          : '',
        localize(currentNode.title, locale),
        localize(currentNode.text, locale),
        currentNode.quote ? localize(currentNode.quote, locale) : '',
      ].filter(Boolean).join(locale === 'zh-CN' ? '。' : '. ')
    : '';

  useEffect(() => {
    emberAudio.setEnabled(profile.soundEnabled);
  }, [profile.soundEnabled]);

  useEffect(() => {
    if (!profile.soundEnabled) return;
    if (inRun && currentNode?.type === 'battle') emberAudio.playMusic('battle');
    else emberAudio.playMusic('menu');
  }, [currentNode?.type, inRun, profile.soundEnabled]);

  useEffect(() => {
    emberNarrator.stop();
    setNarrating(false);
    if (!inRun || !narrationText || !profile.narrationEnabled || !profile.soundEnabled) return;
    const timer = window.setTimeout(() => {
      setNarrating(true);
      const started = emberNarrator.speak(narrationText, locale, () => setNarrating(false));
      if (!started) setNarrating(false);
    }, 420);
    return () => {
      window.clearTimeout(timer);
      emberNarrator.stop();
    };
  }, [inRun, locale, narrationText, profile.narrationEnabled, profile.soundEnabled]);

  useEffect(() => {
    if (!inRun || currentNode?.type !== 'ending' || !currentNode.endingId) return;
    if (completedEndingRef.current === currentNode.endingId) return;
    completedEndingRef.current = currentNode.endingId;
    const updated: PlayerProfile = {
      ...profile,
      runs: profile.runs + 1,
      renown: profile.renown + runRenown,
      endings: [...new Set([...profile.endings, currentNode.endingId])],
      veteranUnlocked: true,
    };
    saveProfile(updated);
    setProfile(updated);
    track('contract_complete', {
      contractId: contract.id,
      endingId: currentNode.endingId,
      difficulty,
      renown: runRenown,
    });
  }, [currentNode, difficulty, inRun, profile, runRenown]);

  if (validationErrors.length) {
    return (
      <main className="fatal-screen">
        <span className="eyebrow">CONTENT VALIDATION FAILED</span>
        <h1>内容包无法加载</h1>
        {validationErrors.map((error) => <p key={error}>{error}</p>)}
      </main>
    );
  }

  const startRun = () => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    void emberAudio.unlock();
    emberAudio.play('ui');
    emberAudio.playMusic('menu');
    const seed = Date.now() % 1_000_000;
    setRunSeed(seed);
    rngRef.current = new SeededRng(seed);
    setParty(createInitialParty());
    setFlags({});
    setRunRenown(0);
    setPendingCheck(null);
    setInterestRecorded(false);
    completedEndingRef.current = null;
    setNodeId(contract.startNodeId);
    setInRun(true);
    track('contract_start', { contractId: contract.id, difficulty, playerName: profile.playerName });
  };

  const requestStart = () => {
    if (profile.playerName.trim()) {
      startRun();
      return;
    }
    emberAudio.play('ui');
    setDraftName('');
    setSigningMode('start');
  };

  const confirmSigning = () => {
    const playerName = draftName.trim().slice(0, 16);
    if (!playerName) return;
    const updated = { ...profile, playerName };
    saveProfile(updated);
    setProfile(updated);
    const shouldStart = signingMode === 'start';
    setSigningMode(null);
    void emberAudio.unlock();
    emberAudio.play('ui');
    emberAudio.playMusic('menu');
    if (shouldStart) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      window.setTimeout(() => {
        const seed = Date.now() % 1_000_000;
        setRunSeed(seed);
        rngRef.current = new SeededRng(seed);
        setParty(createInitialParty());
        setFlags({});
        setRunRenown(0);
        setPendingCheck(null);
        setInterestRecorded(false);
        completedEndingRef.current = null;
        setNodeId(contract.startNodeId);
        setInRun(true);
        track('contract_start', { contractId: contract.id, difficulty, playerName });
      }, 120);
    }
  };

  const applyEffects = (effects: StoryEffect[] = []) => {
    for (const effect of effects) {
      if (effect.type === 'setFlag') {
        setFlags((current) => ({ ...current, [effect.key]: effect.value }));
      }
      if (effect.type === 'gainRenown') {
        setRunRenown((current) => current + effect.amount);
      }
      if (effect.type === 'damageParty') {
        setParty((current) => Object.fromEntries(Object.entries(current).map(([id, hero]) => [id, { ...hero, hp: Math.max(1, hero.hp - effect.amount) }])));
      }
      if (effect.type === 'healPartyPercent') {
        setParty((current) => Object.fromEntries(Object.entries(current).map(([id, hero]) => {
          const template = pack.units.find((unit) => unit.id === hero.templateId)!;
          return [id, { ...hero, hp: Math.min(template.maxHp, hero.hp + Math.ceil(template.maxHp * effect.percent)) }];
        })));
      }
      if (effect.type === 'restoreResource' || effect.type === 'addResource') {
        setParty((current) => Object.fromEntries(Object.entries(current).map(([id, hero]) => {
          if (hero.resources[effect.key] === undefined && effect.key !== 'potion') return [id, hero];
          const template = pack.units.find((unit) => unit.id === hero.templateId)!;
          const value = (hero.resources[effect.key] ?? 0) + effect.amount;
          const templateMax = template.resources?.[effect.key];
          const nextValue = effect.type === 'restoreResource' && templateMax !== undefined ? Math.min(templateMax, value) : value;
          return [id, { ...hero, resources: { ...hero.resources, [effect.key]: nextValue } }];
        })));
      }
    }
  };

  const choose = (choice: StoryChoice) => {
    emberAudio.play(choice.check ? 'dice' : 'ui');
    track('story_choice', { nodeId, choiceId: choice.id });
    if (choice.check) {
      const result = rollD20(rngRef.current, choice.check.modifier);
      const success = result.total >= choice.check.dc;
      setPendingCheck({ choice, result, success });
      track('ability_check', {
        nodeId,
        choiceId: choice.id,
        total: result.total,
        dc: choice.check.dc,
        success,
      });
      return;
    }
    applyEffects(choice.effects);
    if (choice.next) setNodeId(choice.next);
  };

  const finishCheck = () => {
    if (!pendingCheck?.choice.check) return;
    emberAudio.play('ui');
    applyEffects(pendingCheck.success ? pendingCheck.choice.check.successEffects : pendingCheck.choice.check.failureEffects);
    setNodeId(pendingCheck.choice.check.next);
    setPendingCheck(null);
  };

  const updateLocale = () => {
    emberAudio.play('ui');
    setProfile((current) => setProfileLocale(current, localeToggle(current)));
  };

  const returnHome = () => {
    emberNarrator.stop();
    emberAudio.play('ui');
    emberAudio.playMusic('menu');
    setInRun(false);
  };

  if (!inRun) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <button className="brand" onClick={() => setHomeSection('contracts')}>
            <span className="brand-mark">E</span>
            <span><strong>EMBERBOUND</strong><small>余烬契约</small></span>
          </button>
          <nav>
            {(['contracts', 'roster', 'codex', 'settings'] as HomeSection[]).map((section) => (
              <button key={section} className={homeSection === section ? 'active' : ''} onClick={() => setHomeSection(section)}>
                {copy[section]}
              </button>
            ))}
          </nav>
          <button className="language-button" onClick={updateLocale}>{locale === 'zh-CN' ? 'EN' : '中'}</button>
        </header>

        <main className="home-main">
          <section className="home-hero" style={{ '--key-art': `url(${keyArtUrl})` } as React.CSSProperties}>
            <div>
              <span className="eyebrow">THE LASTLIGHT COMPANY · 旅团记录 07</span>
              <h1>{locale === 'zh-CN' ? '每一份契约，都是一场完整的冒险。' : 'Every contract is a complete adventure.'}</h1>
              <p>{locale === 'zh-CN'
                ? '组建三人旅团，在透明骰点、战术棋盘与有后果的选择中完成一段短篇奇幻故事。'
                : 'Lead a three-hero company through transparent dice, tactical battlefields, and choices with consequences.'}</p>
            </div>
            <div className="profile-card">
              <span className="eyebrow">COMPANY RECORD</span>
              <div className="profile-name"><small>{locale === 'zh-CN' ? '契约持有人' : 'CONTRACT BEARER'}</small><strong>{profile.playerName || (locale === 'zh-CN' ? '尚未签名' : 'Unsigned')}</strong></div>
              <div className="profile-stat"><strong>{profile.renown}</strong><span>{copy.renown}</span></div>
              <div className="profile-mini"><span>{copy.runs}</span><b>{profile.runs}</b></div>
              <div className="profile-mini"><span>{copy.endings}</span><b>{profile.endings.length}/3</b></div>
            </div>
          </section>

          {homeSection === 'contracts' && (
            <section className="content-section">
              <div className="section-heading"><div><span className="eyebrow">CONTRACT BOARD</span><h2>{copy.contracts}</h2></div><span>1 / 3</span></div>
              <div className="contract-grid">
                <article className="contract-card featured">
                  <div className="contract-art" style={{ backgroundImage: `url(${keyArtUrl})` }}><span className="status-tag available">{copy.available}</span></div>
                  <div className="contract-body">
                    <span className="eyebrow">{localize(contract.subtitle, locale)}</span>
                    <h3>{localize(contract.title, locale)}</h3>
                    <p>{localize(contract.description, locale)}</p>
                    <div className="contract-meta"><span>⏱ {contract.estimatedMinutes} min</span><span>♟ 3 Heroes</span><span>◈ 3 Endings</span></div>
                    <div className="difficulty-picker">
                      <button className={difficulty === 'explorer' ? 'active' : ''} onClick={() => setDifficulty('explorer')}>{copy.explorer}</button>
                      <button
                        className={difficulty === 'veteran' ? 'active' : ''}
                        disabled={!profile.veteranUnlocked}
                        onClick={() => setDifficulty('veteran')}
                      >{copy.veteran}{!profile.veteranUnlocked ? ' · 🔒' : ''}</button>
                    </div>
                    <button className="primary-button" onClick={requestStart}>{copy.start}<span>→</span></button>
                  </div>
                </article>
                <article className="contract-card locked-card">
                  <div className="locked-runes">◇ ◇ ◇</div>
                  <span className="status-tag">{copy.locked}</span>
                  <span className="eyebrow">CONTRACT 02</span>
                  <h3>{locale === 'zh-CN' ? '玻璃墓穴' : 'The Glass Catacomb'}</h3>
                  <p>{locale === 'zh-CN' ? '内容包结构验证完成，正式故事仍在制作。' : 'The content-pack structure is validated; the full story is in production.'}</p>
                </article>
                <article className="contract-card locked-card dark">
                  <div className="locked-runes">○ ✦ ○</div>
                  <span className="status-tag">{copy.locked}</span>
                  <span className="eyebrow">CONTRACT 03</span>
                  <h3>{locale === 'zh-CN' ? '寂静王冠' : 'The Crown of Quiet'}</h3>
                  <p>{locale === 'zh-CN' ? '一份来自无声王庭的契约。' : 'A contract from a court that has forgotten sound.'}</p>
                </article>
              </div>
            </section>
          )}

          {homeSection === 'roster' && (
            <section className="content-section">
              <div className="section-heading"><div><span className="eyebrow">COMPANY ROSTER</span><h2>{copy.roster}</h2></div><span>LEVEL 3</span></div>
              <div className="roster-grid">
                {pack.units.filter((unit) => unit.team === 'heroes').map((hero) => (
                  <article className="roster-card" key={hero.id} style={{ '--hero-color': `#${hero.color.toString(16).padStart(6, '0')}` } as React.CSSProperties}>
                    <div
                      className={`roster-portrait ${hero.id}`}
                      style={{ backgroundImage: `url(${heroTriptychUrl})` }}
                      aria-label={localize(hero.name, locale)}
                    />
                    <div><span className="eyebrow">{localize(hero.role, locale)}</span><h3>{localize(hero.name, locale)}</h3></div>
                    <div className="roster-stats"><span>HP <b>{hero.maxHp}</b></span><span>AC <b>{hero.ac}</b></span><span>SPD <b>{hero.speed}</b></span></div>
                    <div className="roster-abilities">{hero.abilities.slice(0, 4).map((ability) => <span key={ability.id}>{localize(ability.name, locale)}</span>)}</div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {homeSection === 'codex' && (
            <section className="content-section codex-section">
              <div className="section-heading"><div><span className="eyebrow">ENDING ARCHIVE</span><h2>{copy.codex}</h2></div><span>{profile.endings.length}/3</span></div>
              <div className="ending-grid">
                {[
                  ['rekindled', '守望 / The Watch', '☀'],
                  ['sealed', '无灯之路 / The Unlit Road', '◯'],
                  ['claimed', '余烬债务 / The Ember Debt', '◆'],
                ].map(([id, name, icon]) => (
                  <article className={`ending-card ${profile.endings.includes(id) ? 'seen' : ''}`} key={id}>
                    <span>{profile.endings.includes(id) ? icon : '?'}</span><h3>{profile.endings.includes(id) ? name : '???'}</h3>
                  </article>
                ))}
              </div>
            </section>
          )}

          {homeSection === 'settings' && (
            <section className="content-section settings-section">
              <div className="section-heading"><div><span className="eyebrow">SYSTEM & LICENSE</span><h2>{copy.settings}</h2></div><span>v0.1.0</span></div>
              <div className="settings-grid">
                <article className="settings-card">
                  <h3>{locale === 'zh-CN' ? '语言与声音' : 'Language & sound'}</h3>
                  <button className="settings-row" onClick={updateLocale}><span>{locale === 'zh-CN' ? '界面语言' : 'Interface language'}</span><b>{locale}</b></button>
                  <button className="settings-row" onClick={() => {
                    const updated = { ...profile, soundEnabled: !profile.soundEnabled };
                    saveProfile(updated); setProfile(updated);
                  }}><span>{locale === 'zh-CN' ? '声音' : 'Sound'}</span><b>{profile.soundEnabled ? 'ON' : 'OFF'}</b></button>
                  <button className="settings-row" onClick={() => {
                    const updated = { ...profile, narrationEnabled: !profile.narrationEnabled };
                    saveProfile(updated); setProfile(updated);
                  }}><span>{locale === 'zh-CN' ? 'DM旁白' : 'DM narration'}</span><b>{profile.narrationEnabled ? 'ON' : 'OFF'}</b></button>
                  <button className="settings-row" onClick={() => { setDraftName(profile.playerName); setSigningMode('edit'); }}><span>{locale === 'zh-CN' ? '冒险者昵称' : 'Adventurer name'}</span><b>{profile.playerName || '—'}</b></button>
                </article>
                <article className="settings-card">
                  <h3>{locale === 'zh-CN' ? '内容管线' : 'Content pipeline'}</h3>
                  <p>{locale === 'zh-CN' ? '已校验2个内容包：1个可玩契约＋1个内部结构测试包。' : '2 content packs validated: 1 playable contract + 1 internal fixture pack.'}</p>
                  <div className="pipeline-ok">✓ CONTENT SCHEMA VALID</div>
                </article>
                <article className="settings-card">
                  <h3>{locale === 'zh-CN' ? '正式配乐' : 'Music'}</h3>
                  <p>Vampire&apos;s Piano — TAD<br />JRPG Epic Rock Battle Theme #1 — HydroGene</p>
                  <div className="pipeline-ok">CC0 · COMMERCIAL USE</div>
                </article>
                <article className="settings-card license-card">
                  <h3>SRD 5.2.1 · CC-BY-4.0</h3>
                  <p>This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.</p>
                </article>
              </div>
            </section>
          )}
        </main>
        {signingMode && (
          <div className="signing-overlay" role="dialog" aria-modal="true">
            <form className="signing-contract" onSubmit={(event) => { event.preventDefault(); confirmSigning(); }}>
              <div className="contract-seal">E</div>
              <span className="eyebrow">THE LASTLIGHT COMPANY · FIELD CONTRACT</span>
              <h2>{locale === 'zh-CN' ? '在契约上留下你的名字' : 'Sign your name to the contract'}</h2>
              <p>{locale === 'zh-CN' ? '灰烬记录者会记住这个名字。它将出现在旅团档案、旁白和结局记录中。' : 'The Ashen Chronicler will remember it across the company record, narration, and ending archive.'}</p>
              <label>
                <span>{locale === 'zh-CN' ? '契约持有人' : 'CONTRACT BEARER'}</span>
                <input autoFocus maxLength={16} value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder={locale === 'zh-CN' ? '输入昵称' : 'Enter a name'} />
              </label>
              <div className="signing-suggestions">
                {['洛恩', '伊芙琳', '灰鸦'].map((name) => <button type="button" key={name} onClick={() => setDraftName(name)}>{name}</button>)}
              </div>
              <div className="signing-actions">
                <button type="button" className="secondary-button" onClick={() => setSigningMode(null)}>{locale === 'zh-CN' ? '返回' : 'Back'}</button>
                <button type="submit" className="primary-button" disabled={!draftName.trim()}>{locale === 'zh-CN' ? '落笔并盖印' : 'Sign and seal'}<span>◆</span></button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  if (!currentNode) return null;
  const battle = currentNode.battleId ? pack.battles.find((entry) => entry.id === currentNode.battleId) : undefined;

  return (
    <div className="run-shell">
      <header className="run-topbar">
        <button className="brand compact" onClick={returnHome}><span className="brand-mark">E</span><span><strong>EMBERBOUND</strong><small>{localize(contract.title, locale)}</small></span></button>
        <div className="run-progress"><span style={{ width: `${((contract.story.findIndex((node) => node.id === nodeId) + 1) / contract.story.length) * 100}%` }} /></div>
        <div className="bearer-badge"><small>{locale === 'zh-CN' ? '契约者' : 'BEARER'}</small><strong>{profile.playerName}</strong></div>
        {currentNode.type === 'battle' ? (
          <div className="battle-state-label">{locale === 'zh-CN' ? '战斗数据以右侧状态栏为准' : 'Live battle status is shown in the battle panel'}</div>
        ) : (
          <div className="party-summary">
            {Object.values(party).map((hero) => {
              const template = pack.units.find((unit) => unit.id === hero.templateId)!;
              return <span key={hero.templateId}>{localize(template.name, locale)} <b>{hero.hp}</b></span>;
            })}
          </div>
        )}
        <button className="language-button" onClick={updateLocale}>{locale === 'zh-CN' ? 'EN' : '中'}</button>
      </header>

      {currentNode.type === 'battle' && battle ? (
        <Suspense fallback={<main className="battle-loading"><span className="eyebrow">LOADING BATTLEFIELD</span><h2>{localize(battle.name, locale)}</h2></main>}>
          <BattleScreen
            pack={pack}
            battle={battle}
            locale={locale}
            soundEnabled={profile.soundEnabled}
            seed={runSeed + contract.story.findIndex((node) => node.id === nodeId) * 997}
            options={{
              veteran: difficulty === 'veteran',
              initialAdvantage: currentNode.battleId === 'outer-ward' ? Boolean(flags.openingAdvantage) : Boolean(flags.bossAdvantage),
              inactiveObjectIds: flags.northPylonDisabled ? ['north-pylon'] : [],
              party,
            }}
            onVictory={(nextParty) => {
              setParty(nextParty);
              track('battle_complete', { battleId: battle.id, roundSeed: runSeed, difficulty });
              if (currentNode.next) setNodeId(currentNode.next);
            }}
          />
        </Suspense>
      ) : currentNode.type === 'ending' ? (
        <main className="ending-screen" style={{ '--ending-art': `url(${keyArtUrl})` } as React.CSSProperties}>
          <div className="ending-sigil">{currentNode.endingId === 'rekindled' ? '☀' : currentNode.endingId === 'sealed' ? '◯' : '◆'}</div>
          <span className="eyebrow">{localize(currentNode.eyebrow, locale)}</span>
          <h1>{localize(currentNode.title, locale)}</h1>
          <p>{localize(currentNode.text, locale)}</p>
          <div className="result-stats"><span><b>+{runRenown}</b>{copy.renown}</span><span><b>{difficulty === 'veteran' ? 'V' : 'E'}</b>{difficulty === 'veteran' ? copy.veteran : copy.explorer}</span><span><b>{profile.endings.length}</b>{copy.endings}</span></div>
          <div className="ending-actions">
            {profile.narrationEnabled && <button className="secondary-button" onClick={() => {
              setNarrating(true);
              if (!emberNarrator.speak(narrationText, locale, () => setNarrating(false))) setNarrating(false);
            }}>{narrating ? (locale === 'zh-CN' ? 'DM 讲述中…' : 'DM speaking…') : (locale === 'zh-CN' ? '重听结局' : 'Replay ending')}</button>}
            <button className={`interest-button ${interestRecorded ? 'recorded' : ''}`} onClick={() => {
              setInterestRecorded(true);
              track('next_contract_interest', { endingId: currentNode.endingId ?? 'unknown' });
            }}>{interestRecorded ? (locale === 'zh-CN' ? '✓ 已记录期待' : '✓ Interest recorded') : (locale === 'zh-CN' ? '我想玩下一份契约' : 'I want the next contract')}</button>
            <button className="secondary-button" onClick={startRun}>{copy.replay}</button>
            <button className="primary-button" onClick={() => { returnHome(); setHomeSection('contracts'); }}>{copy.backHome}</button>
          </div>
        </main>
      ) : (
        <main className="story-screen">
          <div
            className={`story-backdrop ${currentNode.id === 'boss-intro' ? 'boss-art' : ''}`}
            style={{ backgroundImage: `url(${currentNode.id === 'boss-intro' ? bossWardenUrl : keyArtUrl})` }}
          ><div className="story-art-vignette" /></div>
          <section className="story-panel">
            <div className={`dm-narration ${narrating ? 'speaking' : ''}`}>
              <span className="dm-seal">DM</span>
              <div><small>THE ASHEN CHRONICLER</small><strong>{narrating ? (locale === 'zh-CN' ? '灰烬记录者正在讲述' : 'The Chronicler is speaking') : (locale === 'zh-CN' ? '灰烬记录者' : 'The Ashen Chronicler')}</strong></div>
              <span className="voice-wave" aria-hidden="true"><i /><i /><i /><i /></span>
              <button onClick={() => {
                setNarrating(true);
                if (!emberNarrator.speak(narrationText, locale, () => setNarrating(false))) setNarrating(false);
              }} aria-label={locale === 'zh-CN' ? '重播旁白' : 'Replay narration'}>↻</button>
            </div>
            <span className="eyebrow">{localize(currentNode.eyebrow, locale)}</span>
            <h1>{localize(currentNode.title, locale)}</h1>
            <p className="story-text">{localize(currentNode.text, locale)}</p>
            {currentNode.quote && <blockquote>{localize(currentNode.quote, locale)}</blockquote>}
            {currentNode.type === 'narrative' && currentNode.next && (
              <button className="primary-button story-continue" onClick={() => { emberAudio.play('ui'); setNodeId(currentNode.next!); }}>{copy.continue}<span>→</span></button>
            )}
            {currentNode.type === 'choice' && (
              <div className="choice-list">
                {currentNode.choices?.map((choice, index) => (
                  <button key={choice.id} className="choice-button" onClick={() => choose(choice)}>
                    <span className="choice-index">0{index + 1}</span>
                    <span><strong>{localize(choice.label, locale)}</strong><small>{localize(choice.description, locale)}</small></span>
                    <b>→</b>
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      {pendingCheck?.choice.check && <DiceCheckOverlay key={`${nodeId}-${pendingCheck.choice.id}`} choice={pendingCheck.choice} result={pendingCheck.result} success={pendingCheck.success} locale={locale} onFinish={finishCheck} />}
    </div>
  );
}
