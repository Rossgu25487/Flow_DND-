import Phaser from 'phaser';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import battleCoreUrl from '../assets/battle-core.png';
import battleOuterUrl from '../assets/battle-outer.png';
import enemySpritesUrl from '../assets/sprites/enemies.png';
import miraSpriteUrl from '../assets/sprites/mira.png';
import orinSpriteUrl from '../assets/sprites/orin.png';
import sableSpriteUrl from '../assets/sprites/sable.png';
import { emberAudio } from '../game/audio';
import { BattleRuntime, type BattleRuntimeOptions } from '../game/battleRuntime';
import { localize } from '../game/i18n';
import { track } from '../game/profile';
import type { AbilityDefinition, BattleDefinition, BattleEvent, BattleSnapshot, BattleUnitState, ContentPack, Locale } from '../game/types';

export interface BattleBoardHandle {
  selectAbility: (abilityId: string) => void;
  endTurn: () => void;
  undoMove: () => void;
  setSpeed: (multiplier: number) => void;
}

interface BattleBoardProps {
  pack: ContentPack;
  battle: BattleDefinition;
  seed: number;
  locale: Locale;
  soundEnabled: boolean;
  options: BattleRuntimeOptions;
  onSnapshot: (snapshot: BattleSnapshot) => void;
  onVictory: (party: ReturnType<BattleRuntime['getPartyState']>) => void;
}

interface SceneApi {
  selectAbility: (abilityId: string) => void;
  endTurn: () => void;
  undoMove: () => void;
  setSpeed: (multiplier: number) => void;
}

const heroGlyph: Record<string, string> = {
  'mira-champion': '⚔',
  'sable-thief': '➶',
  'orin-evoker': '✦',
};

const enemyGlyph: Record<string, string> = {
  'ash-thrall': '☠',
  'cinder-archer': '➶',
  'ember-hound': '♞',
  'ash-warden': '♜',
};

function findLastEvent(events: BattleEvent[], predicate: (event: BattleEvent) => boolean): BattleEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (predicate(events[index])) return events[index];
  }
  return undefined;
}

export const BattleBoard = forwardRef<BattleBoardHandle, BattleBoardProps>(function BattleBoard(
  { pack, battle, seed, locale, soundEnabled, options, onSnapshot, onVictory },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);

  useImperativeHandle(ref, () => ({
    selectAbility: (abilityId) => apiRef.current?.selectAbility(abilityId),
    endTurn: () => apiRef.current?.endTurn(),
    undoMove: () => apiRef.current?.undoMove(),
    setSpeed: (multiplier) => apiRef.current?.setSpeed(multiplier),
  }));

  useEffect(() => {
    if (!hostRef.current) return;
    emberAudio.setEnabled(soundEnabled);
    emberAudio.playMusic('battle');
    const runtime = new BattleRuntime(pack, battle, seed, options);
    const cellSize = 64;
    const boardX = 46;
    const boardY = 34;
    const boardWidth = battle.width * cellSize;
    const boardHeight = battle.height * cellSize;
    let finished = false;
    let disposed = false;
    let enemyTimer: number | undefined;
    let finishTimer: number | undefined;

    class TacticalScene extends Phaser.Scene {
      private processingEnemy = false;
      private animating = false;
      private tokenViews = new Map<string, Phaser.GameObjects.Container>();
      private objectViews = new Map<string, Phaser.GameObjects.Container>();
      private lastActiveUnitId: string | null = null;
      private introShown = false;
      private speedMultiplier = 1;

      constructor() {
        super({ key: 'tactical-board' });
      }

      preload(): void {
        this.load.image('battle-background', battle.id === 'beacon-heart' ? battleCoreUrl : battleOuterUrl);
        this.load.image('mira-sprite', miraSpriteUrl);
        this.load.image('sable-sprite', sableSpriteUrl);
        this.load.image('orin-sprite', orinSpriteUrl);
        this.load.image('enemy-sprites', enemySpritesUrl);
      }

      create(): void {
        this.cameras.main.setBackgroundColor('#08060b');
        const enemyTexture = this.textures.get('enemy-sprites');
        if (!enemyTexture.has('ash-thrall')) {
          enemyTexture.add('ash-thrall', 0, 0, 0, 557, 941);
          enemyTexture.add('cinder-archer', 0, 557, 0, 557, 941);
          enemyTexture.add('ember-hound', 0, 1114, 0, 558, 941);
        }
        this.time.addEvent({
          delay: 520,
          loop: true,
          callback: () => {
            if (disposed || this.animating) return;
            const ember = this.add.circle(
              boardX + Phaser.Math.Between(18, boardWidth - 18),
              boardY + Phaser.Math.Between(20, boardHeight - 20),
              Phaser.Math.Between(1, 2),
              0xf08a47,
              0.55,
            ).setDepth(7);
            this.tweens.add({
              targets: ember,
              y: ember.y - Phaser.Math.Between(18, 42),
              alpha: 0,
              duration: 900,
              onComplete: () => ember.destroy(),
            });
          },
        });
        apiRef.current = {
          selectAbility: (abilityId) => this.selectAbility(abilityId),
          endTurn: () => {
            if (this.animating) return;
            emberAudio.play('ui');
            runtime.endTurn();
            this.sync();
          },
          undoMove: () => this.undoMove(),
          setSpeed: (multiplier) => {
            this.speedMultiplier = multiplier;
            this.tweens.timeScale = multiplier;
            this.time.timeScale = multiplier;
          },
        };
        this.sync();
      }

      private toWorld(x: number, y: number): { x: number; y: number } {
        return { x: boardX + x * cellSize + cellSize / 2, y: boardY + y * cellSize + cellSize / 2 };
      }

      private selectAbility(abilityId: string): void {
        if (this.animating) return;
        const before = runtime.getSnapshot();
        const active = before.units.find((unit) => unit.id === before.activeUnitId);
        const ability = active?.abilities.find((candidate) => candidate.id === abilityId);
        if (!active || !ability) return;
        const accepted = runtime.selectAbility(abilityId);
        if (!accepted) {
          emberAudio.play('ui');
          return;
        }
        track('battle_ability_selected', { battleId: battle.id, unitId: active.id, abilityId, selected: runtime.getSnapshot().selectedAbilityId === abilityId });
        if (ability.target === 'self') {
          const after = runtime.getSnapshot();
          const event = findLastEvent(this.eventsSince(before, after), (candidate) => candidate.type === 'heal');
          emberAudio.play(event ? 'heal' : 'ui');
          const view = this.tokenViews.get(active.id);
          if (view) {
            this.spawnRing(view.x, view.y, event ? 0x68e6b3 : 0xf0bd68);
            if (event?.meta?.amount) this.floatText(view.x, view.y - 20, `+${event.meta.amount}`, '#7ff0bc', false);
          }
          this.time.delayedCall(170, () => this.sync());
          return;
        }
        emberAudio.play('ui');
        this.sync();
      }

      private performMove(x: number, y: number): void {
        if (this.animating) return;
        const before = runtime.getSnapshot();
        const actor = before.units.find((unit) => unit.id === before.activeUnitId);
        const view = actor ? this.tokenViews.get(actor.id) : undefined;
        if (!actor || !view || !runtime.moveActiveUnit(x, y)) return;
        const after = runtime.getSnapshot();
        const moved = after.units.find((unit) => unit.id === actor.id);
        if (!moved) return;
        const target = this.toWorld(moved.x, moved.y);
        this.animating = true;
        this.input.enabled = false;
        emberAudio.play('move');
        onSnapshot(after);
        this.tweens.add({
          targets: view,
          x: target.x,
          y: target.y,
          duration: 320,
          ease: 'Sine.Out',
          onComplete: () => {
            const events = this.eventsSince(before, after);
            const damage = findLastEvent(events, (event) => event.type === 'damage');
            const roll = findLastEvent(events, (event) => event.type === 'roll');
            const settle = () => {
              if (damage) this.playImpact(damage);
              this.time.delayedCall(damage ? 430 : 100, () => {
                this.animating = false;
                this.input.enabled = true;
                this.sync();
              });
            };
            if (roll) this.showRollSpotlight(roll, settle);
            else settle();
          },
        });
      }

      private undoMove(): void {
        if (this.animating) return;
        const before = runtime.getSnapshot();
        const actor = before.units.find((unit) => unit.id === before.activeUnitId);
        const view = actor ? this.tokenViews.get(actor.id) : undefined;
        if (!actor || !view || !runtime.undoLastMove()) {
          emberAudio.play('ui');
          return;
        }
        track('battle_move_undo', { battleId: battle.id, unitId: actor.id });
        const after = runtime.getSnapshot();
        const restored = after.units.find((unit) => unit.id === actor.id);
        if (!restored) return;
        const target = this.toWorld(restored.x, restored.y);
        this.animating = true;
        this.input.enabled = false;
        emberAudio.play('move');
        onSnapshot(after);
        this.tweens.add({
          targets: view,
          x: target.x,
          y: target.y,
          duration: 240,
          ease: 'Sine.InOut',
          onComplete: () => {
            this.animating = false;
            this.input.enabled = true;
            this.sync();
          },
        });
      }

      private performTargetAction(targetId: string): void {
        if (this.animating) return;
        const before = runtime.getSnapshot();
        const actor = before.units.find((unit) => unit.id === before.activeUnitId);
        const ability = actor?.abilities.find((candidate) => candidate.id === before.selectedAbilityId);
        const target = before.units.find((unit) => unit.id === targetId);
        if (!actor || !ability || !target) return;
        if (!runtime.useSelectedOnUnit(targetId)) {
          track('battle_invalid_target', { battleId: battle.id, unitId: actor.id, abilityId: ability.id, targetId });
          emberAudio.play('ui');
          const targetView = this.tokenViews.get(targetId);
          if (targetView) this.floatText(targetView.x, targetView.y - 25, locale === 'zh-CN' ? '目标无效或超出射程' : 'INVALID / OUT OF RANGE', '#d8b87c', false);
          return;
        }
        const after = runtime.getSnapshot();
        onSnapshot(after);
        this.animateAction(actor, target, ability, before, after);
      }

      private animateAction(
        actor: BattleUnitState,
        target: BattleUnitState,
        ability: AbilityDefinition,
        before: BattleSnapshot,
        after: BattleSnapshot,
      ): void {
        const sourceView = this.tokenViews.get(actor.id);
        const targetView = this.tokenViews.get(target.id);
        if (!sourceView || !targetView) {
          this.sync();
          return;
        }
        this.animating = true;
        this.input.enabled = false;
        const events = this.eventsSince(before, after);
        const resolution = findLastEvent(events, (event) => event.type === 'damage' || Boolean(event.meta?.missed));
        const finish = () => {
          if (resolution?.type === 'damage') this.playImpact(resolution);
          if (resolution?.meta?.missed) this.playMiss(targetView.x, targetView.y);
          this.time.delayedCall(resolution?.meta?.critical ? 560 : 430, () => {
            this.animating = false;
            this.input.enabled = true;
            this.sync();
          });
        };

        const playMotion = () => {
          if (ability.id === 'magic-missile') {
            emberAudio.play('spell');
            this.animateVolley(sourceView, targetView, finish);
          } else if (ability.kind === 'auto-damage' || ability.kind === 'save' || ability.tags?.includes('area')) {
            emberAudio.play('spell');
            this.animateProjectile(sourceView, targetView, ability.id.includes('thunder') ? 0xb9a7ff : 0xff8a4b, finish);
          } else if (ability.range > 1) {
            emberAudio.play(ability.id.includes('bow') ? 'arrow' : 'spell');
            this.animateProjectile(sourceView, targetView, ability.id.includes('bow') ? 0xf1cf94 : 0xb9a7ff, finish);
          } else {
            emberAudio.play('swing');
            const dx = (targetView.x - sourceView.x) * 0.42;
            const dy = (targetView.y - sourceView.y) * 0.42;
            this.tweens.add({
              targets: sourceView,
              x: sourceView.x + dx,
              y: sourceView.y + dy,
              duration: 160,
              ease: 'Cubic.In',
              yoyo: true,
              hold: resolution?.meta?.critical ? 125 : 88,
              onYoyo: () => {
                this.spawnSlash(targetView.x, targetView.y, resolution?.meta?.critical ?? false);
                finish();
              },
            });
          }
        };
        const roll = findLastEvent(events, (event) => event.type === 'roll');
        if (roll) this.showRollSpotlight(roll, playMotion);
        else playMotion();
      }

      private animateProjectile(source: Phaser.GameObjects.Container, target: Phaser.GameObjects.Container, color: number, onImpact: () => void): void {
        const trail = this.add.circle(source.x, source.y, 6, color, 1).setDepth(30);
        const glow = this.add.circle(source.x, source.y, 12, color, 0.18).setDepth(29);
        this.tweens.add({
          targets: [trail, glow],
          x: target.x,
          y: target.y,
          duration: Phaser.Math.Clamp(260 + Phaser.Math.Distance.Between(source.x, source.y, target.x, target.y) * 0.38, 300, 480),
          ease: 'Quad.In',
          onComplete: () => {
            trail.destroy();
            glow.destroy();
            onImpact();
          },
        });
      }

      private showRollSpotlight(event: BattleEvent, onComplete: () => void): void {
        const meta = event.meta;
        if (!meta?.rolls?.length || meta.chosen === undefined || meta.total === undefined || meta.targetNumber === undefined) {
          onComplete();
          return;
        }
        const rolls = meta.rolls;
        emberAudio.play('dice');
        const success = Boolean(meta.success);
        const natural20 = meta.chosen === 20;
        const natural1 = meta.chosen === 1;
        const color = natural20 ? 0xf0bd68 : natural1 ? 0xd25743 : success ? 0x58c79b : 0x8d7d91;
        const neutralColor = 0xb08a62;
        const overlay = this.add.container(boardX + boardWidth / 2, boardY + 78).setDepth(92).setAlpha(0).setScale(0.84);
        const plate = this.add.rectangle(0, 0, 278, 82, 0x09070d, 0.94).setStrokeStyle(1, neutralColor, 0.75);
        const die = this.add.polygon(-94, 0, [-22, -28, 22, -28, 31, -4, 23, 27, -23, 27, -31, -4], 0x211626, 1)
          .setStrokeStyle(2, neutralColor, 1);
        const face = this.add.text(-94, 0, '?', {
          color: '#ffe3a5', fontFamily: 'Cinzel, serif', fontSize: '25px', fontStyle: 'bold',
        }).setOrigin(0.5);
        const mode = this.add.text(-45, -22, meta.rollMode === 'save' ? (locale === 'zh-CN' ? '豁免检定' : 'SAVING THROW') : (locale === 'zh-CN' ? '攻击检定' : 'ATTACK ROLL'), {
          color: '#b7a8ba', fontFamily: 'sans-serif', fontSize: '9px', letterSpacing: 1,
        });
        const formula = this.add.text(-45, 1, locale === 'zh-CN' ? '骰子仍在滚动…' : 'The die is still turning…', {
          color: '#f4e7d2', fontFamily: 'Cinzel, serif', fontSize: '13px', fontStyle: 'bold',
        });
        const verdict = this.add.text(-45, 23, '', { color: `#${color.toString(16).padStart(6, '0')}`, fontFamily: 'sans-serif', fontSize: '10px', fontStyle: 'bold' });
        overlay.add([plate, die, face, mode, formula, verdict]);
        this.tweens.add({ targets: overlay, alpha: 1, scale: 1, y: overlay.y + 7, duration: 190, ease: 'Back.Out' });
        const ticker = this.time.addEvent({
          delay: 72,
          repeat: 8,
          callback: () => {
            face.setText(String(Phaser.Math.Between(1, 20)));
            die.setRotation(Phaser.Math.FloatBetween(-0.12, 0.12));
          },
        });
        this.time.delayedCall(720, () => {
          ticker.remove(false);
          face.setText(String(meta.chosen));
          plate.setStrokeStyle(1, color, 0.95);
          die.setRotation(0).setFillStyle(color, 0.18).setStrokeStyle(2, color, 1);
          const rollLabel = rolls.length > 1 ? rolls.join(' / ') : String(meta.chosen);
          formula.setText(`${rollLabel} + ${meta.modifier ?? 0} = ${meta.total}  /  ${meta.rollMode === 'save' ? 'DC' : 'AC'} ${meta.targetNumber}`);
          verdict.setText(natural20 ? (locale === 'zh-CN' ? '自然 20 · 暴击' : 'NATURAL 20 · CRITICAL') : natural1 ? (locale === 'zh-CN' ? '自然 1 · 大失败' : 'NATURAL 1 · FAILURE') : success ? (locale === 'zh-CN' ? '成功' : 'SUCCESS') : (locale === 'zh-CN' ? '失败' : 'FAILURE'));
          this.tweens.add({ targets: [die, face], scale: 1.16, duration: 90, yoyo: true, hold: 75, ease: 'Quad.Out' });
          if (natural20) emberAudio.play('crit');
        });
        this.time.delayedCall(1390, () => {
          this.tweens.add({
            targets: overlay,
            alpha: 0,
            y: overlay.y - 8,
            duration: 180,
            onComplete: () => {
              overlay.destroy();
              onComplete();
            },
          });
        });
      }

      private animateVolley(source: Phaser.GameObjects.Container, target: Phaser.GameObjects.Container, onImpact: () => void): void {
        let completed = 0;
        for (let index = 0; index < 3; index += 1) {
          const orb = this.add.circle(source.x, source.y - 5 + index * 5, 5, 0xb58cff, 1).setDepth(31).setAlpha(0);
          const glow = this.add.circle(source.x, source.y - 5 + index * 5, 11, 0x7e54e8, 0.2).setDepth(30).setAlpha(0);
          this.tweens.add({
            targets: [orb, glow],
            alpha: 1,
            x: target.x + (index - 1) * 6,
            y: target.y + (index - 1) * 4,
            delay: index * 150,
            duration: 310,
            ease: 'Cubic.In',
            onComplete: () => {
              this.spawnBurst(orb.x, orb.y, 0xb58cff, 5, false);
              orb.destroy();
              glow.destroy();
              completed += 1;
              if (completed === 3) onImpact();
            },
          });
        }
      }

      private performObject(objectId: string): void {
        if (this.animating) return;
        const view = this.objectViews.get(objectId);
        if (!view || !runtime.interactObject(objectId)) return;
        const after = runtime.getSnapshot();
        onSnapshot(after);
        this.animating = true;
        this.input.enabled = false;
        emberAudio.play('pylon');
        this.cameras.main.shake(220, 0.009);
        this.spawnBurst(view.x, view.y, 0xff8b45, 18, true);
        this.tweens.add({
          targets: view,
          scale: 1.35,
          alpha: 0.15,
          angle: 35,
          duration: 480,
          ease: 'Back.In',
          onComplete: () => {
            this.animating = false;
            this.input.enabled = true;
            this.sync();
          },
        });
      }

      private animateEnemyTurn(before: BattleSnapshot, after: BattleSnapshot, actorId: string): void {
        const beforeActor = before.units.find((unit) => unit.id === actorId);
        const afterActor = after.units.find((unit) => unit.id === actorId);
        const view = this.tokenViews.get(actorId);
        const events = this.eventsSince(before, after);
        const damage = findLastEvent(events, (event) => event.type === 'damage');
        const missed = findLastEvent(events, (event) => Boolean(event.meta?.missed));
        const roll = findLastEvent(events, (event) => event.type === 'roll');
        const resolve = () => {
          if (damage) this.playImpact(damage);
          if (missed?.meta?.targetId) {
            const targetView = this.tokenViews.get(missed.meta.targetId);
            if (targetView) this.playMiss(targetView.x, targetView.y);
          }
          this.time.delayedCall(damage || missed ? 460 : 120, () => {
            this.animating = false;
            this.input.enabled = true;
            this.processingEnemy = false;
            this.sync();
          });
        };
        this.animating = true;
        this.input.enabled = false;
        onSnapshot(after);
        const resolveWithRoll = () => {
          if (roll) this.showRollSpotlight(roll, resolve);
          else resolve();
        };
        if (view && beforeActor && afterActor && (beforeActor.x !== afterActor.x || beforeActor.y !== afterActor.y)) {
          const point = this.toWorld(afterActor.x, afterActor.y);
          emberAudio.play('move');
          this.tweens.add({ targets: view, x: point.x, y: point.y, duration: 340, ease: 'Sine.Out', onComplete: resolveWithRoll });
        } else {
          resolveWithRoll();
        }
      }

      private playImpact(event: BattleEvent): void {
        const target = event.meta?.targetId ? this.tokenViews.get(event.meta.targetId) : undefined;
        const source = event.meta?.sourceId ? this.tokenViews.get(event.meta.sourceId) : undefined;
        if (!target) return;
        const critical = Boolean(event.meta?.critical);
        const abilityId = event.meta?.abilityId ?? '';
        const impactColor = abilityId.includes('magic') ? 0xb58cff
          : abilityId.includes('thunder') ? 0xb9a7ff
            : abilityId.includes('fire') || abilityId.includes('orb') || abilityId.includes('ember') || abilityId.includes('flare') ? 0xff8a47
              : abilityId.includes('bow') ? 0xe8cf98
                : critical ? 0xffd277 : 0xe6664b;
        emberAudio.play(critical ? 'crit' : 'hit');
        this.cameras.main.shake(critical ? 190 : 105, critical ? 0.014 : 0.0065);
        this.cameras.main.flash(critical ? 95 : 55, 255, critical ? 169 : 96, critical ? 73 : 58);
        this.spawnBurst(target.x, target.y, impactColor, critical ? 20 : 11, critical);
        if (abilityId.includes('thunder')) {
          this.spawnRing(target.x, target.y, 0xb9a7ff);
          this.spawnRing(target.x, target.y, 0x7154c6);
        }
        this.floatText(target.x, target.y - 24, `-${event.meta?.amount ?? 0}${critical ? '!' : ''}`, critical ? '#ffd477' : '#ff8a70', critical);
        this.tweens.add({ targets: target, scaleX: 1.17, scaleY: 0.84, alpha: 0.35, duration: 58, yoyo: true, ease: 'Quad.Out' });
        if (source && event.meta?.sneakAttack) this.spawnRing(source.x, source.y, 0x72e6bc);
      }

      private playMiss(x: number, y: number): void {
        emberAudio.play('swing');
        this.floatText(x, y - 22, locale === 'zh-CN' ? '未命中' : 'MISS', '#afa6b5', false);
      }

      private spawnBurst(x: number, y: number, color: number, count: number, strong: boolean): void {
        for (let index = 0; index < count; index += 1) {
          const angle = (Math.PI * 2 * index) / count + Phaser.Math.FloatBetween(-0.25, 0.25);
          const distance = Phaser.Math.Between(strong ? 28 : 18, strong ? 58 : 36);
          const spark = this.add.rectangle(x, y, strong ? 4 : 3, Phaser.Math.Between(2, 7), color, 1).setRotation(angle).setDepth(40);
          this.tweens.add({
            targets: spark,
            x: x + Math.cos(angle) * distance,
            y: y + Math.sin(angle) * distance,
            alpha: 0,
            scaleY: 0.2,
            duration: strong ? 360 : 240,
            ease: 'Quad.Out',
            onComplete: () => spark.destroy(),
          });
        }
      }

      private spawnSlash(x: number, y: number, critical: boolean): void {
        const slash = this.add.rectangle(x, y, critical ? 72 : 50, critical ? 5 : 3, critical ? 0xffd277 : 0xf4d6bb, 0.92)
          .setRotation(-0.7)
          .setDepth(45)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: slash,
          scaleX: 1.35,
          scaleY: 0.15,
          alpha: 0,
          duration: critical ? 220 : 150,
          ease: 'Quad.Out',
          onComplete: () => slash.destroy(),
        });
      }

      private spawnRing(x: number, y: number, color: number): void {
        const ring = this.add.circle(x, y, 14, color, 0).setStrokeStyle(3, color, 0.9).setDepth(34);
        this.tweens.add({ targets: ring, radius: 38, alpha: 0, duration: 330, ease: 'Quad.Out', onComplete: () => ring.destroy() });
      }

      private floatText(x: number, y: number, value: string, color: string, strong: boolean): void {
        const label = this.add.text(x, y, value, {
          color,
          fontFamily: 'Cinzel, serif',
          fontSize: strong ? '24px' : '17px',
          fontStyle: 'bold',
          stroke: '#120a0d',
          strokeThickness: 4,
        }).setOrigin(0.5).setDepth(50);
        this.tweens.add({
          targets: label,
          y: y - (strong ? 56 : 38),
          alpha: 0,
          scale: strong ? 1.22 : 1,
          duration: strong ? 980 : 820,
          ease: 'Cubic.Out',
          onComplete: () => label.destroy(),
        });
      }

      private eventsSince(before: BattleSnapshot, after: BattleSnapshot): BattleEvent[] {
        const lastId = before.events.at(-1)?.id ?? 0;
        return after.events.filter((event) => event.id > lastId);
      }

      private createUnitSprite(unit: BattleUnitState): Phaser.GameObjects.Image | null {
        let image: Phaser.GameObjects.Image | null = null;
        if (unit.templateId === 'mira-champion') {
          image = this.add.image(0, 21, 'mira-sprite').setOrigin(0.5, 1).setScale(0.069);
        } else if (unit.templateId === 'sable-thief') {
          image = this.add.image(0, 21, 'sable-sprite').setOrigin(0.5, 1).setScale(0.064);
        } else if (unit.templateId === 'orin-evoker') {
          image = this.add.image(0, 21, 'orin-sprite').setOrigin(0.5, 1).setScale(0.052);
        } else if (unit.templateId === 'ash-thrall') {
          image = this.add.image(1, 21, 'enemy-sprites', 'ash-thrall').setOrigin(0.5, 1).setScale(0.078);
        } else if (unit.templateId === 'cinder-archer') {
          image = this.add.image(0, 21, 'enemy-sprites', 'cinder-archer').setOrigin(0.5, 1).setScale(0.078);
        } else if (unit.templateId === 'ember-hound') {
          image = this.add.image(2, 20, 'enemy-sprites', 'ember-hound').setOrigin(0.5, 1).setScale(0.074);
        }
        if (image) {
          image.setDepth(2);
          this.tweens.add({
            targets: image,
            y: image.y - 2,
            duration: 850 + (unit.id.length % 4) * 110,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
          });
        }
        return image;
      }

      private showTurnBanner(unit: BattleUnitState): void {
        const banner = this.add.container(boardX + boardWidth / 2, boardY + 35).setDepth(80).setAlpha(0);
        const plate = this.add.rectangle(0, 0, 230, 34, 0x0b0810, 0.88).setStrokeStyle(1, 0xd09958, 0.72);
        const label = this.add.text(0, 0, `${locale === 'zh-CN' ? '行动' : 'TURN'} · ${localize(unit.name, locale)}`, {
          color: '#f2d59c',
          fontFamily: 'Cinzel, serif',
          fontSize: '13px',
          fontStyle: 'bold',
          letterSpacing: 2,
        }).setOrigin(0.5);
        banner.add([plate, label]);
        this.tweens.add({
          targets: banner,
          alpha: 1,
          y: banner.y + 8,
          duration: 150,
          hold: 620,
          yoyo: true,
          onComplete: () => banner.destroy(),
        });
      }

      private showBattleIntro(): void {
        const overlay = this.add.container(boardX + boardWidth / 2, boardY + boardHeight / 2).setDepth(95).setAlpha(0);
        const shade = this.add.rectangle(0, 0, boardWidth, 112, 0x07050a, 0.9).setStrokeStyle(1, 0x8f603d, 0.65);
        const title = this.add.text(0, -15, localize(battle.name, locale), {
          color: '#f5ddb1', fontFamily: 'Cinzel, serif', fontStyle: 'bold', fontSize: '25px', letterSpacing: 3,
        }).setOrigin(0.5);
        const objective = this.add.text(0, 22, localize(battle.objective, locale), {
          color: '#b9adb9', fontFamily: 'sans-serif', fontSize: '11px', align: 'center', wordWrap: { width: boardWidth - 80 },
        }).setOrigin(0.5);
        overlay.add([shade, title, objective]);
        this.tweens.add({
          targets: overlay,
          alpha: 1,
          duration: 180,
          hold: 1150,
          yoyo: true,
          onComplete: () => overlay.destroy(),
        });
      }

      sync(): void {
        if (disposed || !this.sys?.displayList || this.animating) return;
        this.children.removeAll(true);
        this.tokenViews.clear();
        this.objectViews.clear();
        const snapshot = runtime.getSnapshot();
        const active = snapshot.units.find((unit) => unit.id === snapshot.activeUnitId);
        const reachable = new Set(snapshot.reachableCells.map((cell) => `${cell.x},${cell.y}`));
        const previewByTarget = new Map(snapshot.targetPreviews.map((preview) => [preview.targetId, preview]));
        const intentByUnit = new Map(snapshot.enemyIntents.map((intent) => [intent.unitId, intent]));

        this.add.rectangle(boardX + boardWidth / 2, boardY + boardHeight / 2, boardWidth + 20, boardHeight + 20, 0x120e18, 1)
          .setStrokeStyle(3, 0x9a643b, 0.7)
          .setDepth(0);
        this.add.image(boardX + boardWidth / 2, boardY + boardHeight / 2, 'battle-background')
          .setDisplaySize(boardWidth, boardHeight)
          .setAlpha(0.98)
          .setDepth(1);
        this.add.rectangle(boardX + boardWidth / 2, boardY + boardHeight / 2, boardWidth, boardHeight, 0x0a0710, 0.045).setDepth(2);

        for (let y = 0; y < battle.height; y += 1) {
          for (let x = 0; x < battle.width; x += 1) {
            const terrain = battle.terrain.find((cell) => cell.x === x && cell.y === y)?.kind;
            const isReachable = reachable.has(`${x},${y}`);
            let fill = 0x111018;
            let alpha = 0.008;
            if (terrain === 'blocked') { fill = 0x050408; alpha = 0.09; }
            if (terrain === 'difficult') { fill = 0x8f4b27; alpha = 0.055; }
            if (terrain === 'cover') { fill = 0x88848a; alpha = 0.045; }
            const tile = this.add.rectangle(
              boardX + x * cellSize + cellSize / 2,
              boardY + y * cellSize + cellSize / 2,
              cellSize - 3,
              cellSize - 3,
              isReachable ? 0x2b8a72 : fill,
              isReachable ? 0.032 : alpha,
            ).setStrokeStyle(1, isReachable ? 0x77e3bd : 0xd1b08a, isReachable ? 0.18 : 0.035).setDepth(5);
            if (terrain !== 'blocked') {
              tile.setInteractive({ useHandCursor: isReachable });
              tile.on('pointerdown', () => this.performMove(x, y));
              tile.on('pointerover', () => {
                tile.setFillStyle(isReachable ? 0x2b8a72 : 0xd8b47a, isReachable ? 0.14 : 0.055);
                tile.setStrokeStyle(1, isReachable ? 0x8ff3d1 : 0xe0bf95, isReachable ? 0.72 : 0.24);
              });
              tile.on('pointerout', () => {
                tile.setFillStyle(isReachable ? 0x2b8a72 : fill, isReachable ? 0.032 : alpha);
                tile.setStrokeStyle(1, isReachable ? 0x77e3bd : 0xd1b08a, isReachable ? 0.18 : 0.035);
              });
            }
            if (terrain === 'cover') this.add.text(tile.x, tile.y, '▰', { color: '#b7aaa4', fontSize: '16px', stroke: '#151018', strokeThickness: 3 }).setOrigin(0.5).setAlpha(0.75).setDepth(6);
            if (terrain === 'difficult') this.add.text(tile.x, tile.y, '✦', { color: '#d47743', fontSize: '13px' }).setOrigin(0.5).setAlpha(0.65).setDepth(6);
          }
        }

        for (const object of snapshot.objects) {
          const point = this.toWorld(object.x, object.y);
          const halo = this.add.circle(0, 0, 24, object.active ? 0xe3623f : 0x4d4652, object.active ? 0.15 : 0.06).setStrokeStyle(1, object.active ? 0xff9f5c : 0x756d7b, 0.8);
          const star = this.add.star(0, 0, 6, 10, 22, object.active ? 0xe56f42 : 0x4d4652, object.active ? 0.92 : 0.48).setStrokeStyle(2, object.active ? 0xffd08a : 0x756d7b, 1);
          const label = this.add.text(0, 31, localize(object.name, locale), { color: object.active ? '#ffd7a0' : '#77717c', fontFamily: 'sans-serif', fontSize: '9px', stroke: '#120d14', strokeThickness: 3 }).setOrigin(0.5);
          const container = this.add.container(point.x, point.y, [halo, star, label]).setDepth(12).setSize(52, 60).setInteractive({ useHandCursor: object.active });
          container.on('pointerdown', () => this.performObject(object.id));
          if (object.active) this.tweens.add({ targets: halo, scale: 1.22, alpha: 0.04, duration: 780, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
          this.objectViews.set(object.id, container);
        }

        for (const unit of snapshot.units.filter((candidate) => candidate.hp > 0)) {
          const point = this.toWorld(unit.x, unit.y);
          const isActive = unit.id === snapshot.activeUnitId;
          const preview = previewByTarget.get(unit.id);
          const intent = intentByUnit.get(unit.id);
          const inRange = Boolean(preview?.inRange);
          const shadow = this.add.ellipse(0, 16, 43, 15, 0x000000, 0.55);
          const activeHalo = this.add.circle(0, 0, isActive ? 28 : 24, isActive ? 0xf2bd68 : unit.color, isActive ? 0.16 : 0.09)
            .setStrokeStyle(isActive ? 3 : 1, isActive ? 0xffcf77 : unit.accent, isActive ? 1 : 0.35);
          const sprite = this.createUnitSprite(unit);
          const body = this.add.circle(0, 0, unit.tags.includes('boss') ? 23 : 20, unit.color, sprite ? 0.18 : 0.96).setStrokeStyle(3, unit.accent, unit.team === 'heroes' ? 0.95 : 0.78);
          const glyph = heroGlyph[unit.templateId] ?? enemyGlyph[unit.templateId] ?? localize(unit.name, locale).slice(0, 1);
          const icon = this.add.text(0, -1, glyph, { color: '#fff7e5', fontFamily: 'serif', fontStyle: 'bold', fontSize: unit.tags.includes('boss') ? '20px' : '17px', stroke: '#1a0d12', strokeThickness: 3 }).setOrigin(0.5).setVisible(!sprite);
          const hpBase = this.add.rectangle(0, 27, 46, 6, 0x1d1119, 1);
          const hpFill = this.add.rectangle(-23, 27, 46 * (unit.hp / unit.maxHp), 6, unit.team === 'heroes' ? 0x58c79b : 0xd25343, 1).setOrigin(0, 0.5);
          const hpText = this.add.text(0, 37, `${unit.hp}/${unit.maxHp}`, { color: '#e7dce8', fontFamily: 'sans-serif', fontSize: '9px', stroke: '#100a0e', strokeThickness: 3 }).setOrigin(0.5);
          const pieces: Phaser.GameObjects.GameObject[] = [shadow, activeHalo, body, ...(sprite ? [sprite] : []), icon, hpBase, hpFill, hpText];
          if (inRange) pieces.push(this.add.circle(0, 0, 27, 0xff615d, 0.08).setStrokeStyle(2, 0xff7b6e, 0.95));
          if (preview?.inRange && preview.chance !== null) {
            const chanceColor = preview.chance >= 65 ? 0x6fe0b4 : preview.chance >= 40 ? 0xe2b768 : 0xe36d5a;
            const damage = preview.minDamage !== null && preview.maxDamage !== null ? ` · ${preview.minDamage}-${preview.maxDamage}` : '';
            const edge = preview.advantage ? ' ▲' : preview.disadvantage ? ' ▼' : '';
            pieces.push(this.add.rectangle(0, -46, 72, 17, 0x0a080d, 0.92).setStrokeStyle(1, chanceColor, 0.9));
            pieces.push(this.add.text(0, -46, `${preview.chance}%${damage}${edge}`, { color: `#${chanceColor.toString(16).padStart(6, '0')}`, fontFamily: 'sans-serif', fontSize: '9px', fontStyle: 'bold' }).setOrigin(0.5));
          } else if (intent) {
            const intentTarget = snapshot.units.find((candidate) => candidate.id === intent.targetId);
            const intentColor = intent.kind === 'attack' ? 0xe36d5a : 0xd0a15f;
            const targetInitial = intentTarget ? localize(intentTarget.name, locale).slice(0, 1) : '?';
            const damage = intent.estimatedDamage ? ` · ${intent.estimatedDamage}` : '';
            pieces.push(this.add.rectangle(0, -46, 88, 17, 0x0a080d, 0.92).setStrokeStyle(1, intentColor, 0.88));
            pieces.push(this.add.text(0, -46, `${intent.kind === 'attack' ? '⚔' : '➜'} → ${targetInitial}${damage}`, { color: `#${intentColor.toString(16).padStart(6, '0')}`, fontFamily: 'sans-serif', fontSize: '9px', fontStyle: 'bold' }).setOrigin(0.5));
          }
          if (unit.statuses.includes('advantage-next')) pieces.push(this.add.text(19, -27, '▲', { color: '#8ef2c7', fontSize: '12px', stroke: '#102018', strokeThickness: 3 }).setOrigin(0.5));
          const token = this.add.container(point.x, point.y, pieces).setDepth(20).setSize(54, 74).setInteractive({ useHandCursor: inRange });
          token.on('pointerdown', () => this.performTargetAction(unit.id));
          if (isActive) this.tweens.add({ targets: activeHalo, scale: 1.16, alpha: 0.05, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
          this.tokenViews.set(unit.id, token);
        }

        onSnapshot(snapshot);
        if (!this.introShown) {
          this.introShown = true;
          this.showBattleIntro();
        }
        if (active?.team === 'heroes' && active.id !== this.lastActiveUnitId) this.showTurnBanner(active);
        this.lastActiveUnitId = active?.id ?? null;
        if (snapshot.outcome === 'victory' && !finished) {
          finished = true;
          emberAudio.play('victory');
          this.cameras.main.zoomTo(1.035, 420, 'Sine.easeInOut');
          finishTimer = window.setTimeout(() => { if (!disposed) onVictory(runtime.getPartyState()); }, 1450);
        }
        if (snapshot.outcome === 'defeat') emberAudio.play('defeat');
        if (snapshot.outcome === 'playing' && active?.team === 'enemies' && !this.processingEnemy) {
          this.processingEnemy = true;
          enemyTimer = window.setTimeout(() => {
            if (disposed) return;
            const before = runtime.getSnapshot();
            const actorId = before.activeUnitId;
            if (!actorId) return;
            runtime.runEnemyTurn();
            this.animateEnemyTurn(before, runtime.getSnapshot(), actorId);
          }, 680 / this.speedMultiplier);
        }
      }
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: battle.width * cellSize + 92,
      height: battle.height * cellSize + 68,
      backgroundColor: '#08060b',
      scene: TacticalScene,
      render: { antialias: true, pixelArt: false },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });

    return () => {
      disposed = true;
      if (enemyTimer) window.clearTimeout(enemyTimer);
      if (finishTimer) window.clearTimeout(finishTimer);
      apiRef.current = null;
      game.destroy(true);
    };
  }, [battle, locale, onSnapshot, onVictory, options, pack, seed, soundEnabled]);

  return <div className="battle-canvas" ref={hostRef} aria-label={localize(battle.name, locale)} />;
});
