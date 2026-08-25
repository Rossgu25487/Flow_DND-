export type Locale = 'zh-CN' | 'en-US';
export type Team = 'heroes' | 'enemies';
export type ActionCost = 'action' | 'bonus' | 'free';
export type AbilityTarget = 'enemy' | 'self';
export type DamageType =
  | 'slashing'
  | 'piercing'
  | 'bludgeoning'
  | 'fire'
  | 'force'
  | 'necrotic'
  | 'radiant';
export type AbilityScore = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type StatusId = 'advantage-next' | 'hidden' | 'prone' | 'guarded';

export interface LocalizedText {
  'zh-CN': string;
  'en-US': string;
}

export interface ResourceCost {
  key: string;
  amount: number;
}

export interface AbilityDefinition {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  target: AbilityTarget;
  cost: ActionCost;
  range: number;
  kind: 'attack' | 'save' | 'auto-damage' | 'heal' | 'utility';
  attackBonus?: number;
  save?: { ability: AbilityScore; dc: number };
  damage?: { dice: string; bonus?: number; type: DamageType; halfOnMiss?: boolean; halfOnSave?: boolean };
  healing?: { dice: string; bonus?: number };
  resourceCost?: ResourceCost;
  utility?: 'action-surge' | 'steady-aim' | 'hide';
  push?: number;
  tags?: string[];
}

export interface UnitTemplate {
  id: string;
  name: LocalizedText;
  role: LocalizedText;
  team: Team;
  level?: number;
  maxHp: number;
  ac: number;
  speed: number;
  initiative: number;
  saves: Partial<Record<AbilityScore, number>>;
  color: number;
  accent: number;
  abilities: AbilityDefinition[];
  resources?: Record<string, number>;
  tags?: string[];
}

export interface UnitPlacement {
  id: string;
  templateId: string;
  x: number;
  y: number;
}

export interface TerrainCell {
  x: number;
  y: number;
  kind: 'difficult' | 'blocked' | 'cover';
}

export interface BattleObjectDefinition {
  id: string;
  name: LocalizedText;
  x: number;
  y: number;
  kind: 'pylon';
  active: boolean;
}

export interface BattleDefinition {
  id: string;
  name: LocalizedText;
  objective: LocalizedText;
  width: number;
  height: number;
  terrain: TerrainCell[];
  heroes: UnitPlacement[];
  enemies: UnitPlacement[];
  objects?: BattleObjectDefinition[];
  bossUnitId?: string;
}

export interface UnitPersistentState {
  templateId: string;
  hp: number;
  resources: Record<string, number>;
}

export interface BattleUnitState extends UnitPersistentState {
  id: string;
  name: LocalizedText;
  role: LocalizedText;
  team: Team;
  maxHp: number;
  ac: number;
  speed: number;
  initiative: number;
  saves: Partial<Record<AbilityScore, number>>;
  color: number;
  accent: number;
  abilities: AbilityDefinition[];
  tags: string[];
  x: number;
  y: number;
  statuses: StatusId[];
  actionAvailable: boolean;
  bonusAvailable: boolean;
  moveRemaining: number;
  reactionAvailable: boolean;
  sneakAttackUsed: boolean;
}

export interface BattleObjectState extends BattleObjectDefinition {}

export interface BattleEvent {
  id: number;
  type: 'system' | 'roll' | 'damage' | 'heal' | 'move' | 'turn' | 'objective';
  text: LocalizedText;
  meta?: {
    sourceId?: string;
    targetId?: string;
    abilityId?: string;
    amount?: number;
    critical?: boolean;
    sneakAttack?: boolean;
    missed?: boolean;
    objectId?: string;
    rolls?: number[];
    chosen?: number;
    modifier?: number;
    total?: number;
    targetNumber?: number;
    rollMode?: 'attack' | 'save';
    advantage?: boolean;
    disadvantage?: boolean;
    success?: boolean;
  };
}

export interface BattleSnapshot {
  battleId: string;
  round: number;
  activeUnitId: string | null;
  units: BattleUnitState[];
  objects: BattleObjectState[];
  events: BattleEvent[];
  outcome: 'playing' | 'victory' | 'defeat';
  selectedAbilityId: string | null;
  reachableCells: Array<{ x: number; y: number }>;
}

export type StoryEffect =
  | { type: 'setFlag'; key: string; value: boolean | string | number }
  | { type: 'damageParty'; amount: number }
  | { type: 'healPartyPercent'; percent: number }
  | { type: 'restoreResource'; key: string; amount: number }
  | { type: 'addResource'; key: string; amount: number }
  | { type: 'gainRenown'; amount: number };

export interface StoryCheck {
  label: LocalizedText;
  actor: LocalizedText;
  ability: LocalizedText;
  modifier: number;
  dc: number;
  successText: LocalizedText;
  failureText: LocalizedText;
  successEffects: StoryEffect[];
  failureEffects: StoryEffect[];
  next: string;
}

export interface StoryChoice {
  id: string;
  label: LocalizedText;
  description: LocalizedText;
  check?: StoryCheck;
  effects?: StoryEffect[];
  next?: string;
}

export interface StoryNode {
  id: string;
  type: 'narrative' | 'choice' | 'battle' | 'ending';
  eyebrow: LocalizedText;
  title: LocalizedText;
  text: LocalizedText;
  quote?: LocalizedText;
  next?: string;
  choices?: StoryChoice[];
  battleId?: string;
  endingId?: string;
}

export interface ContractDefinition {
  id: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  description: LocalizedText;
  estimatedMinutes: number;
  startNodeId: string;
  story: StoryNode[];
}

export interface ContentManifest {
  id: string;
  version: string;
  ruleset: string;
  title: LocalizedText;
  locales: Locale[];
  contractIds: string[];
}

export interface ContentPack {
  manifest: ContentManifest;
  units: UnitTemplate[];
  battles: BattleDefinition[];
  contracts: ContractDefinition[];
}

export interface PlayerProfile {
  saveVersion: number;
  runs: number;
  renown: number;
  endings: string[];
  veteranUnlocked: boolean;
  locale: Locale;
  soundEnabled: boolean;
  narrationEnabled: boolean;
  playerName: string;
}

export interface TelemetryEvent {
  name: string;
  timestamp: number;
  data?: Record<string, string | number | boolean>;
}
