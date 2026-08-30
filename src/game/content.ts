import { z } from 'zod';
import type {
  CardDefinition,
  CharacterDefinition,
  CollectibleDefinition,
  ContentPack,
  EncounterDefinition,
  EnemyDefinition,
  EventDefinition,
  NodeDefinition,
  RelicDefinition,
  RewardDefinition,
  StatusDefinition,
} from './types';
import type { EffectRegistry } from './effects';

const effectSchema = z.object({
  effectId: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

const packSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  locale: z.string().min(1),
  ruleSet: z.object({
    id: z.string().min(1),
    startingCharacterId: z.string().min(1),
    startingDeck: z.array(z.string().min(1)).min(1),
    startingHealth: z.number().positive(),
    startingGold: z.number().nonnegative(),
    startingCollectibleIds: z.array(z.string()),
    startingBoonIds: z.array(z.string()).min(3),
    handSize: z.number().int().positive(),
    handLimit: z.number().int().positive(),
    resources: z.record(z.object({ perTurn: z.number(), maximum: z.number().optional() })),
    turn: z.object({ discardHandAtEnd: z.boolean(), clearBlockAtStart: z.boolean() }),
    shop: z.object({
      cardOfferCount: z.number().int().positive(), cardPriceMin: z.number().nonnegative(), cardPriceMax: z.number().nonnegative(),
      cardPriceRanges: z.record(z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() })).optional(),
      collectibleOfferCount: z.number().int().nonnegative(), collectiblePriceMin: z.number().nonnegative(), collectiblePriceMax: z.number().nonnegative(),
      collectiblePriceRanges: z.record(z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() })).optional(),
      healing: z.object({ basePrice: z.number().nonnegative(), priceStep: z.number().nonnegative(), percent: z.number().positive() }),
      removal: z.object({ basePrice: z.number().nonnegative(), priceStep: z.number().nonnegative(), minimumDeckSize: z.number().int().positive() }),
      upgrade: z.object({ basePrice: z.number().nonnegative(), priceStep: z.number().nonnegative() }),
    }),
    normalCombatGold: z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() }),
    rewardChoiceCount: z.number().int().nonnegative(),
    map: z.object({
      floorCount: z.number().int().positive(),
      minNodes: z.number().int().min(4),
      maxNodes: z.number().int().min(4),
      rows: z.number().int().min(3),
      shopCount: z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() }),
      rewardCount: z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() }),
      remainingWeights: z.object({ combat: z.number().nonnegative(), event: z.number().nonnegative() }),
    }),
    scoring: z.object({
      node: z.number(), battle: z.number(), boss: z.number(), floor: z.number(),
      remainingHealth: z.number(), victory: z.number(), metaTokenDivisor: z.number().positive(),
    }),
  }),
  characters: z.array(z.object({
    id: z.string(), nameKey: z.string(), descriptionKey: z.string(), resourceId: z.string(),
    maxHealth: z.number().positive(), startingDeck: z.array(z.string()).min(1), unlockCost: z.number().nonnegative(),
    metaUpgrades: z.array(z.object({ id: z.string(), stat: z.enum(['maxHealth', 'startingResource']), amount: z.number(), cost: z.number().nonnegative() })),
  })).min(1),
  cards: z.array(z.object({
    id: z.string().min(1), nameKey: z.string(), descriptionKey: z.string(),
    cost: z.object({ resourceId: z.string(), amount: z.number().nonnegative() }),
    target: z.enum(['none', 'self', 'enemy']), type: z.enum(['attack', 'ability', 'skill', 'defense']),
    playDestination: z.enum(['discard', 'exhaust']), rarity: z.enum(['gray', 'blue', 'purple', 'gold', 'red']).optional(), tags: z.array(z.string()).optional(), effects: z.array(effectSchema),
    upgrades: z.array(z.object({
      descriptionKey: z.string(), cost: z.object({ resourceId: z.string(), amount: z.number().nonnegative() }).optional(), effects: z.array(effectSchema).optional(),
    })).optional(),
  })),
  enemies: z.array(z.object({
    id: z.string(), nameKey: z.string(), level: z.number().int().positive(), maxHealth: z.number().positive(),
    mechanismKey: z.string(), notesKey: z.string(), animationKey: z.string().optional(),
    intents: z.array(z.object({ id: z.string(), nameKey: z.string(), target: z.enum(['none', 'self', 'enemy']), effects: z.array(effectSchema) })).min(1),
  })),
  encounters: z.array(z.object({ id: z.string(), level: z.number().int().min(1), category: z.enum(['normal', 'special', 'elite', 'boss']), enemyIds: z.array(z.string()).min(1), rewardPool: z.array(z.string()).optional() })),
  nodes: z.array(z.object({ id: z.string(), handlerId: z.string().min(1), floors: z.array(z.number().int().positive()).optional(), encounterPool: z.array(z.string()).optional(), eventPool: z.array(z.string()).optional(), rewardPool: z.array(z.string()).optional() })),
  events: z.array(z.object({
    id: z.string(), titleKey: z.string(), bodyKey: z.string(),
    options: z.array(z.object({
      id: z.string(), labelKey: z.string(), effects: z.array(effectSchema), healthCost: z.number().nonnegative().optional(),
      goldCost: z.number().nonnegative().optional(), encounterId: z.string().optional(), guaranteedCollectibleId: z.string().optional(),
      requiresCardChoice: z.boolean().optional(), transformsCard: z.boolean().optional(), recordsBloodLetterCondition: z.boolean().optional(),
    })).min(1),
  })),
  statuses: z.array(z.object({
    id: z.string(), nameKey: z.string(), descriptionKey: z.string(), stacking: z.enum(['stack', 'replace']),
    triggers: z.record(z.array(effectSchema)).optional(),
  })),
  relics: z.array(z.object({
    id: z.string(), nameKey: z.string(), descriptionKey: z.string(), triggers: z.record(z.array(effectSchema)).optional(),
  })),
  collectibles: z.array(z.object({
    id: z.string(), nameKey: z.string(), descriptionKey: z.string(), kind: z.enum(['positive', 'negative', 'story']), rarity: z.enum(['blue', 'purple', 'gold']).optional(),
    triggers: z.array(z.object({ hook: z.enum(['combatStart', 'turnStart', 'turnEnd', 'afterCardDrawn', 'afterCardPlayed', 'combatEnd']), cardTag: z.string().optional(), every: z.number().int().positive().optional(), effects: z.array(effectSchema) })).optional(),
    onAcquire: z.array(effectSchema).optional(),
  })),
  rewards: z.array(z.object({
    id: z.string(), nameKey: z.string(), descriptionKey: z.string(), type: z.enum(['currency', 'collectible', 'healing', 'card']),
    amount: z.number().optional(), collectibleId: z.string().optional(), cardId: z.string().optional(),
  })),
  assets: z.array(z.object({ key: z.string(), type: z.enum(['image', 'audio', 'spritesheet']), url: z.string(), frameWidth: z.number().optional(), frameHeight: z.number().optional() })),
  localization: z.record(z.string()),
});

function uniqueById(items: readonly { id: string }[], category: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Duplicate ${category} id: ${item.id}`);
    ids.add(item.id);
  }
}

export class ContentRegistry {
  readonly pack: ContentPack;
  readonly cards: Map<string, CardDefinition>;
  readonly characters: Map<string, CharacterDefinition>;
  readonly enemies: Map<string, EnemyDefinition>;
  readonly encounters: Map<string, EncounterDefinition>;
  readonly nodes: Map<string, NodeDefinition>;
  readonly events: Map<string, EventDefinition>;
  readonly statuses: Map<string, StatusDefinition>;
  readonly relics: Map<string, RelicDefinition>;
  readonly collectibles: Map<string, CollectibleDefinition>;
  readonly rewards: Map<string, RewardDefinition>;

  constructor(input: unknown, effects: EffectRegistry) {
    this.pack = packSchema.parse(input) as ContentPack;
    const groups = [
      ['card', this.pack.cards], ['enemy', this.pack.enemies], ['encounter', this.pack.encounters],
      ['node', this.pack.nodes], ['event', this.pack.events], ['status', this.pack.statuses], ['relic', this.pack.relics],
      ['character', this.pack.characters], ['collectible', this.pack.collectibles], ['reward', this.pack.rewards],
    ] as const;
    for (const [name, items] of groups) uniqueById(items, name);

    this.cards = new Map(this.pack.cards.map((value) => [value.id, value]));
    this.characters = new Map(this.pack.characters.map((value) => [value.id, value]));
    this.enemies = new Map(this.pack.enemies.map((value) => [value.id, value]));
    this.encounters = new Map(this.pack.encounters.map((value) => [value.id, value]));
    this.nodes = new Map(this.pack.nodes.map((value) => [value.id, value]));
    this.events = new Map(this.pack.events.map((value) => [value.id, value]));
    this.statuses = new Map(this.pack.statuses.map((value) => [value.id, value]));
    this.relics = new Map(this.pack.relics.map((value) => [value.id, value]));
    this.collectibles = new Map(this.pack.collectibles.map((value) => [value.id, value]));
    this.rewards = new Map(this.pack.rewards.map((value) => [value.id, value]));

    this.validateReferences(effects);
  }

  text(key: string): string {
    return this.pack.localization[key] ?? key;
  }

  private validateReferences(effects: EffectRegistry): void {
    if (this.pack.ruleSet.map.minNodes > this.pack.ruleSet.map.maxNodes) throw new Error('Map minNodes cannot exceed maxNodes.');
    this.require(this.characters, this.pack.ruleSet.startingCharacterId, 'starting character');
    for (const cardId of this.pack.ruleSet.startingDeck) this.require(this.cards, cardId, 'starting card');
    for (const card of this.pack.cards) {
      if (!(card.cost.resourceId in this.pack.ruleSet.resources)) throw new Error(`Unknown resource on card ${card.id}: ${card.cost.resourceId}`);
      this.requireText(card.nameKey); this.requireText(card.descriptionKey); this.requireEffects(card.effects, effects);
      for (const upgrade of card.upgrades ?? []) {
        this.requireText(upgrade.descriptionKey); this.requireEffects(upgrade.effects ?? [], effects);
        if (upgrade.cost && !(upgrade.cost.resourceId in this.pack.ruleSet.resources)) throw new Error(`Unknown upgrade resource on card ${card.id}: ${upgrade.cost.resourceId}`);
      }
    }
    for (const character of this.pack.characters) {
      this.requireText(character.nameKey); this.requireText(character.descriptionKey);
      if (!(character.resourceId in this.pack.ruleSet.resources)) throw new Error(`Unknown character resource: ${character.resourceId}`);
      character.startingDeck.forEach((id) => this.require(this.cards, id, `starting card in ${character.id}`));
    }
    this.pack.ruleSet.startingCollectibleIds.forEach((id) => this.require(this.collectibles, id, 'starting collectible'));
    for (const enemy of this.pack.enemies) {
      this.requireText(enemy.nameKey); this.requireText(enemy.mechanismKey); this.requireText(enemy.notesKey);
      for (const intent of enemy.intents) { this.requireText(intent.nameKey); this.requireEffects(intent.effects, effects); }
    }
    for (const encounter of this.pack.encounters) {
      encounter.enemyIds.forEach((id) => this.require(this.enemies, id, `enemy in ${encounter.id}`));
      encounter.rewardPool?.forEach((id) => this.require(this.rewards, id, `reward in ${encounter.id}`));
    }
    for (const node of this.pack.nodes) {
      node.encounterPool?.forEach((id) => this.require(this.encounters, id, `encounter in ${node.id}`));
      node.eventPool?.forEach((id) => this.require(this.events, id, `event in ${node.id}`));
      node.rewardPool?.forEach((id) => this.require(this.rewards, id, `reward in ${node.id}`));
    }
    for (const event of this.pack.events) {
      this.requireText(event.titleKey); this.requireText(event.bodyKey);
      event.options.forEach((option) => {
        this.requireText(option.labelKey); this.requireEffects(option.effects, effects);
        if (option.encounterId) this.require(this.encounters, option.encounterId, `event encounter in ${event.id}`);
        if (option.guaranteedCollectibleId) this.require(this.collectibles, option.guaranteedCollectibleId, `event collectible in ${event.id}`);
      });
    }
    for (const status of this.pack.statuses) {
      this.requireText(status.nameKey); this.requireText(status.descriptionKey);
      Object.values(status.triggers ?? {}).flat().forEach((effect) => this.requireEffects([effect], effects));
    }
    for (const relic of this.pack.relics) {
      this.requireText(relic.nameKey); this.requireText(relic.descriptionKey);
      Object.values(relic.triggers ?? {}).flat().forEach((effect) => this.requireEffects([effect], effects));
    }
    for (const collectible of this.pack.collectibles) {
      this.requireText(collectible.nameKey); this.requireText(collectible.descriptionKey);
      collectible.triggers?.forEach((trigger) => this.requireEffects(trigger.effects, effects));
      this.requireEffects(collectible.onAcquire ?? [], effects);
    }
    for (const reward of this.pack.rewards) {
      this.requireText(reward.nameKey); this.requireText(reward.descriptionKey);
      if (reward.collectibleId) this.require(this.collectibles, reward.collectibleId, `collectible reward ${reward.id}`);
      if (reward.cardId) this.require(this.cards, reward.cardId, `card reward ${reward.id}`);
    }
    for (let floor = 1; floor <= this.pack.ruleSet.map.floorCount; floor += 1) {
      if (!this.pack.nodes.some((node) => node.handlerId === 'core.boss' && (!node.floors || node.floors.includes(floor)))) throw new Error(`Content pack must define a boss node for floor ${floor}.`);
      if (!this.pack.nodes.some((node) => node.handlerId === 'core.combat' && (!node.floors || node.floors.includes(floor)))) throw new Error(`Content pack must define a combat node for floor ${floor}.`);
    }
  }

  private require<T>(map: Map<string, T>, id: string, label: string): void {
    if (!map.has(id)) throw new Error(`Unknown ${label}: ${id}`);
  }

  private requireText(key: string): void {
    if (!(key in this.pack.localization)) throw new Error(`Missing localization key: ${key}`);
  }

  private requireEffects(invocations: readonly { effectId: string }[], effects: EffectRegistry): void {
    for (const invocation of invocations) {
      if (!effects.has(invocation.effectId)) throw new Error(`Unregistered effect: ${invocation.effectId}`);
    }
  }
}
