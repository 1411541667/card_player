export type GamePhase = 'menu' | 'character-select' | 'boon-select' | 'boon-remove' | 'theme-select' | 'map' | 'combat' | 'reward' | 'shop' | 'event' | 'rest' | 'result';
export type NodeKind = string;
export type TargetRule = 'none' | 'self' | 'enemy';
export type TriggerHook = 'combatStart' | 'turnStart' | 'turnEnd' | 'afterCardDrawn' | 'afterCardPlayed' | 'combatEnd' | 'afterDamageBlocked';
export type CardType = 'attack' | 'ability' | 'skill' | 'defense';
export type CardRarity = 'gray' | 'blue' | 'purple' | 'gold' | 'red';
export type CollectibleRarity = 'blue' | 'purple' | 'gold';

export interface EffectInvocation {
  effectId: string;
  params?: Record<string, unknown>;
}

export interface RuleSetDefinition {
  id: string;
  startingCharacterId: string;
  startingDeck: string[];
  startingHealth: number;
  startingGold: number;
  startingCollectibleIds: string[];
  startingBoonIds: string[];
  handSize: number;
  handLimit: number;
  resources: Record<string, { perTurn: number; maximum?: number }>;
  turn: {
    discardHandAtEnd: boolean;
    clearBlockAtStart: boolean;
  };
  shop: {
    cardOfferCount: number;
    cardPriceMin: number;
    cardPriceMax: number;
    cardPriceRanges?: Partial<Record<CardRarity, { min: number; max: number }>>;
    collectibleOfferCount: number;
    collectiblePriceMin: number;
    collectiblePriceMax: number;
    collectiblePriceRanges?: Partial<Record<CollectibleRarity, { min: number; max: number }>>;
    healing: { basePrice: number; priceStep: number; percent: number };
    removal: { basePrice: number; priceStep: number; minimumDeckSize: number };
    upgrade: { basePrice: number; priceStep: number };
  };
  normalCombatGold: { min: number; max: number };
  rewardChoiceCount: number;
  map: {
    floorCount: number;
    minNodes: number;
    maxNodes: number;
    rows: number;
    maxNodesPerRow: number;
    shopCount: { min: number; max: number };
    rewardCount: { min: number; max: number };
    eliteCount: number;
    restCount: { min: number; max: number };
    remainingWeights: { combat: number; event: number };
  };
  scoring: {
    node: number;
    battle: number;
    boss: number;
    floor: number;
    remainingHealth: number;
    victory: number;
    metaTokenDivisor: number;
  };
}

export interface CharacterDefinition {
  id: string;
  nameKey: string;
  descriptionKey: string;
  resourceId: string;
  maxHealth: number;
  startingDeck: string[];
  /** Per-character starting collectibles; falls back to the rule set list when absent. */
  startingCollectibleIds?: string[];
  unlockCost: number;
  metaUpgrades: Array<{ id: string; stat: 'maxHealth' | 'startingResource'; amount: number; cost: number }>;
}

export interface CardDefinition {
  id: string;
  nameKey: string;
  descriptionKey: string;
  cost: { resourceId: string; amount: number };
  target: TargetRule;
  type: CardType;
  rarity?: CardRarity;
  playDestination: 'discard' | 'exhaust';
  tags?: string[];
  effects: EffectInvocation[];
  upgrades?: Array<{
    descriptionKey: string;
    cost?: { resourceId: string; amount: number };
    effects?: EffectInvocation[];
  }>;
}

export interface IntentDefinition {
  id: string;
  nameKey: string;
  target: TargetRule;
  effects: EffectInvocation[];
}

export interface EnemyDefinition {
  id: string;
  nameKey: string;
  level: number;
  maxHealth: number;
  mechanismKey: string;
  notesKey: string;
  animationKey?: string;
  intents: IntentDefinition[];
}

export interface EncounterDefinition {
  id: string;
  level: number;
  category: 'normal' | 'special' | 'elite' | 'boss';
  enemyIds: string[];
  /** How many enemies spawn for this encounter (default 1). */
  enemyCount?: number;
  rewardPool?: string[];
}

export interface NodeDefinition {
  id: string;
  handlerId: string;
  floors?: number[];
  encounterPool?: string[];
  eventPool?: string[];
  rewardPool?: string[];
}

export interface EventOptionDefinition {
  id: string;
  labelKey: string;
  effects: EffectInvocation[];
  healthCost?: number;
  goldCost?: number;
  encounterId?: string;
  guaranteedCollectibleId?: string;
  requiresCardChoice?: boolean;
  transformsCard?: boolean;
  recordsBloodLetterCondition?: boolean;
}

export interface EventDefinition {
  id: string;
  titleKey: string;
  bodyKey: string;
  options: EventOptionDefinition[];
}

export interface StatusDefinition {
  id: string;
  nameKey: string;
  descriptionKey: string;
  stacking: 'stack' | 'replace';
  triggers?: Partial<Record<TriggerHook, EffectInvocation[]>>;
}

export interface RelicDefinition {
  id: string;
  nameKey: string;
  descriptionKey: string;
  triggers?: Partial<Record<TriggerHook, EffectInvocation[]>>;
}

export interface CollectibleTriggerDefinition {
  hook: TriggerHook;
  cardTag?: string;
  every?: number;
  effects: EffectInvocation[];
}

export interface CollectibleDefinition {
  id: string;
  nameKey: string;
  descriptionKey: string;
  kind: 'positive' | 'negative' | 'story';
  rarity?: CollectibleRarity;
  triggers?: CollectibleTriggerDefinition[];
  onAcquire?: EffectInvocation[];
}

export interface RewardDefinition {
  id: string;
  nameKey: string;
  descriptionKey: string;
  type: 'currency' | 'collectible' | 'healing' | 'card';
  amount?: number;
  collectibleId?: string;
  cardId?: string;
}

export interface AssetDefinition {
  key: string;
  type: 'image' | 'audio' | 'spritesheet';
  url: string;
  frameWidth?: number;
  frameHeight?: number;
}

export interface ContentPack {
  id: string;
  version: string;
  locale: string;
  ruleSet: RuleSetDefinition;
  characters: CharacterDefinition[];
  cards: CardDefinition[];
  enemies: EnemyDefinition[];
  encounters: EncounterDefinition[];
  nodes: NodeDefinition[];
  events: EventDefinition[];
  statuses: StatusDefinition[];
  relics: RelicDefinition[];
  collectibles: CollectibleDefinition[];
  rewards: RewardDefinition[];
  assets: AssetDefinition[];
  localization: Record<string, string>;
}

export interface CardInstance {
  instanceId: string;
  definitionId: string;
  upgradeLevel: number;
}

export interface DeckState {
  cards: CardInstance[];
}

export interface StatusInstance {
  definitionId: string;
  stacks: number;
  duration?: number;
  scope?: 'combat' | 'run';
}

export interface PlayerState {
  characterId: string;
  health: number;
  maxHealth: number;
  block: number;
  gold: number;
  resources: Record<string, number>;
  resourcePerTurn: Record<string, number>;
  statuses: StatusInstance[];
  relicIds: string[];
  collectibleIds: string[];
}

export interface EnemyState {
  instanceId: string;
  definitionId: string;
  health: number;
  block: number;
  statuses: StatusInstance[];
  intentIndex: number;
}

export interface CombatState {
  encounterId: string;
  turn: number;
  activeSide: 'player' | 'enemy' | 'complete';
  player: PlayerState;
  enemies: EnemyState[];
  drawPile: CardInstance[];
  hand: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  cardsDrawn: number;
  angerAttacksUsed?: number;
  /** Attack cards played for free this turn while status.conceal is active. */
  concealAttacksUsed?: number;
}

export interface MapNodeState {
  id: string;
  layer: number;
  column: number;
  definitionId: string;
  handlerId: string;
  connections: string[];
  visited: boolean;
  available: boolean;
  iconKey?: string;
}

export interface MapState {
  nodes: MapNodeState[];
  currentNodeId?: string;
}

export interface RewardState {
  offers: Array<{ id: string; rewardDefinitionId: string }>;
  source: 'node' | 'elite' | 'boss';
  continuation: 'map' | 'next-floor' | 'result';
  canSkip: boolean;
}

export interface ShopOfferState {
  id: string;
  type: 'card' | 'collectible' | 'heal' | 'remove' | 'upgrade';
  cardDefinitionId?: string;
  collectibleId?: string;
  amount?: number;
  basePrice: number;
  priceStep: number;
  purchaseCount: number;
  soldOut: boolean;
}

export interface ShopState {
  offers: ShopOfferState[];
  returnPhase: 'map' | 'theme-select';
}

export interface EventState {
  definitionId: string;
}

export interface RestState {
  nodeId?: string;
}

export interface ResultState {
  outcome: 'victory' | 'defeat';
  completedNodes: number;
  score: number;
  metaTokens: number;
  defeatedById?: string;
}

export interface RunMetrics {
  battlesWon: number;
  bossesDefeated: number;
  nodesVisited: number;
  floorsCleared: number;
  damageTaken: number;
  battlesStarted: number;
}

export interface RunSetupState {
  boonOffers: string[];
  selectedBoonId?: string;
  pendingCardRemovals: number;
  themeId?: string;
}

export interface RunState {
  id: string;
  seed: string;
  floor: number;
  totalFloors: number;
  phase: Exclude<GamePhase, 'menu' | 'character-select'>;
  player: PlayerState;
  deck: DeckState;
  map: MapState;
  combat?: CombatState;
  reward?: RewardState;
  shop?: ShopState;
  event?: EventState;
  rest?: RestState;
  result?: ResultState;
  metrics: RunMetrics;
  setup?: RunSetupState;
  pendingCollectibleId?: string;
  lastEnemyId?: string;
  encounteredEnemyIds?: string[];
  bloodLetterConditionRecorded?: boolean;
}

export interface GameState {
  phase: GamePhase;
  run?: RunState;
  pendingSeed?: string;
  revision: number;
}

export type GameSnapshot = Readonly<GameState>;

export type GameCommand =
  | { type: 'NEW_RUN'; seed?: string }
  | { type: 'SELECT_CHARACTER'; characterId: string }
  | { type: 'SELECT_BOON'; boonId: string }
  | { type: 'REMOVE_STARTING_CARD'; cardInstanceId: string }
  | { type: 'SELECT_THEME'; themeId: string }
  | { type: 'ENTER_NODE'; nodeId: string }
  | { type: 'PLAY_CARD'; cardInstanceId: string; targetId?: string }
  | { type: 'END_TURN' }
  | { type: 'CHOOSE_REWARD'; rewardOfferId?: string }
  | { type: 'BUY_CARD'; offerId: string }
  | { type: 'BUY_SHOP_OFFER'; offerId: string; cardInstanceId?: string }
  | { type: 'LEAVE_SHOP' }
  | { type: 'CHOOSE_EVENT'; optionId: string; cardInstanceId?: string }
  | { type: 'CHOOSE_REST'; option: 'heal' | 'upgrade'; cardInstanceId?: string }
  | { type: 'RETURN_TO_MENU' }
  | { type: 'DEBUG_SET_RESOURCE'; resourceId: string; amount: number }
  | { type: 'DEBUG_JUMP_NODE'; nodeId: string }
  | { type: 'DEBUG_START_EVENT'; eventId: string }
  | { type: 'DEBUG_WIN_COMBAT' }
  | { type: 'DEBUG_JUMP_FLOOR'; floor: number };

export interface DomainEvent {
  type: string;
  payload: Record<string, unknown>;
  revision: number;
}

export type EffectOperation =
  | { type: 'damage'; target: 'player' | string; amount: number }
  | { type: 'block'; target: 'player' | string; amount: number }
  | { type: 'draw'; amount: number }
  | { type: 'gainResource'; resourceId: string; amount: number }
  | { type: 'heal'; target: 'player' | string; amount: number }
  | { type: 'gainGold'; amount: number }
  | { type: 'addStatus'; target: 'player' | string; statusId: string; stacks: number; duration?: number }
  | { type: 'healPercent'; target: 'player' | string; percent: number }
  | { type: 'gainCollectible'; collectibleId: string }
  | { type: 'gainRandomCollectible' }
  | { type: 'addRunStatus'; statusId: string; stacks: number }
  | { type: 'upgradeRandomCards'; cardTag: string; count: number }
  | { type: 'multiplyGoldRandom'; upMultiplier: number; downMultiplier: number; upChance: number };

export interface EffectContext {
  readonly snapshot: GameSnapshot;
  readonly source: 'player' | string;
  readonly target?: 'player' | string;
  readonly stacks?: number;
  random(namespace: string): number;
}

export type EffectHandler = (
  context: EffectContext,
  params: Readonly<Record<string, unknown>>,
) => EffectOperation[];

export interface RandomState {
  seed: string;
  counters: Record<string, number>;
}

export interface RunSaveV2 {
  schemaVersion: 2;
  contentPackId: string;
  contentPackVersion: string;
  savedAt: string;
  game: GameState;
  random: RandomState;
}

export interface RunHistoryEntry {
  runId: string;
  seed: string;
  outcome: 'victory' | 'defeat';
  score: number;
  earnedTokens: number;
  floorReached: number;
  battles: number;
  defeatedById?: string;
  finishedAt: string;
}

export interface MetaProgressV2 {
  schemaVersion: 2;
  tokens: number;
  unlockedCharacterIds: string[];
  unlockedCardIds: string[];
  unlockedStoryIds: string[];
  purchasedUpgradeIds: string[];
  discoveredCharacterIds: string[];
  discoveredCardIds: string[];
  discoveredEnemyIds: string[];
  discoveredCollectibleIds: string[];
  runHistory: RunHistoryEntry[];
}
