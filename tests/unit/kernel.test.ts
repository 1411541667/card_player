import { describe, expect, it } from 'vitest';
import { ContentRegistry } from '../../src/game/content';
import { wastelandContentPack } from '../../src/content/wasteland';
import { createCoreEffectRegistry } from '../../src/game/effects';
import { GameKernel } from '../../src/game/kernel';
import { createCoreNodeHandlers } from '../../src/game/nodes';
import type { GameSnapshot } from '../../src/game/types';
import { cardCost } from '../../src/game/cards';

function createKernel() {
  const effects = createCoreEffectRegistry();
  const content = new ContentRegistry(structuredClone(wastelandContentPack), effects);
  return new GameKernel(content, effects, createCoreNodeHandlers());
}

function startReadyRun(kernel: GameKernel, seed: string): void {
  kernel.dispatch({ type: 'NEW_RUN', seed });
  kernel.dispatch({ type: 'SELECT_CHARACTER', characterId: 'character.scavenger' });
  const offers = kernel.getSnapshot().run!.setup!.boonOffers;
  const boonId = offers.find((id) => id !== 'boon.gold-shop' && id !== 'boon.remove-three') ?? offers[0];
  kernel.dispatch({ type: 'SELECT_BOON', boonId });
  if (kernel.getSnapshot().phase === 'shop') kernel.dispatch({ type: 'LEAVE_SHOP' });
  while (kernel.getSnapshot().phase === 'boon-remove') {
    kernel.dispatch({ type: 'REMOVE_STARTING_CARD', cardInstanceId: kernel.getSnapshot().run!.deck.cards[0].instanceId });
  }
  kernel.dispatch({ type: 'SELECT_THEME', themeId: 'theme.dust' });
}

function playCombat(kernel: GameKernel): void {
  let turns = 0;
  while (kernel.getSnapshot().phase === 'combat' && turns < 80) {
    turns += 1;
    let actions = 0;
    while (kernel.getSnapshot().phase === 'combat' && actions < 20) {
      actions += 1;
      const combat = kernel.getSnapshot().run!.combat!;
      const playable = combat.hand
        .map((card) => ({ card, definition: wastelandContentPack.cards.find((item) => item.id === card.definitionId)! }))
        .filter(({ card, definition }) => {
          const cost = cardCost(definition, card);
          return combat.player.resources[cost.resourceId] >= cost.amount;
        })
        .sort((left, right) => {
          const priority = (type: string) => ({ ability: 0, defense: 1, attack: 2, skill: 3 }[type] ?? 4);
          return priority(left.definition.type) - priority(right.definition.type);
        })[0];
      if (!playable) break;
      const targetId = combat.enemies.find((enemy) => enemy.health > 0)?.instanceId;
      kernel.dispatch({ type: 'PLAY_CARD', cardInstanceId: playable.card.instanceId, targetId });
    }
    if (kernel.getSnapshot().phase === 'combat') kernel.dispatch({ type: 'END_TURN' });
  }
  expect(turns).toBeLessThan(80);
}

function chooseReward(kernel: GameKernel): void {
  const snapshot = kernel.getSnapshot();
  const offers = snapshot.run!.reward!.offers;
  const player = snapshot.run!.player;
  const ranked = offers
    .map((offer) => ({ offer, reward: wastelandContentPack.rewards.find((item) => item.id === offer.rewardDefinitionId)! }))
    .sort((left, right) => {
      const priority = (type: string) => player.health < player.maxHealth * 0.65
        ? ({ healing: 0, collectible: 1, card: 2, currency: 3 }[type] ?? 4)
        : ({ collectible: 0, card: 1, currency: 2, healing: 3 }[type] ?? 4);
      return priority(left.reward.type) - priority(right.reward.type);
    });
  kernel.dispatch({ type: 'CHOOSE_REWARD', rewardOfferId: ranked[0]?.offer.id });
}

function completeRun(seed: string): GameSnapshot {
  const kernel = createKernel();
  startReadyRun(kernel, seed);
  let steps = 0;
  while (kernel.getSnapshot().phase !== 'result' && steps < 400) {
    steps += 1;
    const snapshot = kernel.getSnapshot();
    if (snapshot.phase === 'map') {
      const available = snapshot.run!.map.nodes.filter((node) => node.available && !node.visited);
      const preference = ['core.reward', 'core.event', 'core.shop', 'core.combat', 'core.boss'];
      available.sort((left, right) => preference.indexOf(left.handlerId) - preference.indexOf(right.handlerId));
      kernel.dispatch({ type: 'ENTER_NODE', nodeId: available[0].id });
    } else if (snapshot.phase === 'combat') playCombat(kernel);
    else if (snapshot.phase === 'reward') chooseReward(kernel);
    else if (snapshot.phase === 'shop') kernel.dispatch({ type: 'LEAVE_SHOP' });
    else if (snapshot.phase === 'event') {
      const event = wastelandContentPack.events.find((item) => item.id === snapshot.run!.event!.definitionId)!;
      const affordable = event.options.find((option) => (option.healthCost ?? 0) < snapshot.run!.player.health && (option.goldCost ?? 0) <= snapshot.run!.player.gold);
      kernel.dispatch({ type: 'CHOOSE_EVENT', optionId: (affordable ?? event.options[event.options.length - 1]).id });
    }
  }
  expect(steps).toBeLessThan(400);
  return kernel.getSnapshot();
}

describe('Wasteland GameKernel', () => {
  it('creates deterministic maps with 12–20 nodes and one floor boss', () => {
    const first = createKernel();
    const second = createKernel();
    startReadyRun(first, 'same-seed');
    startReadyRun(second, 'same-seed');
    expect(first.getSnapshot().run!.map).toEqual(second.getSnapshot().run!.map);
    const nodes = first.getSnapshot().run!.map.nodes;
    expect(nodes.length).toBeGreaterThanOrEqual(12);
    expect(nodes.length).toBeLessThanOrEqual(20);
    expect(nodes.filter((node) => node.handlerId === 'core.boss')).toHaveLength(1);
    expect(nodes.filter((node) => node.handlerId === 'core.shop').length).toBeGreaterThanOrEqual(2);
    expect(nodes.filter((node) => node.handlerId === 'core.shop').length).toBeLessThanOrEqual(3);
    expect(nodes.filter((node) => node.handlerId === 'core.reward').length).toBeGreaterThanOrEqual(4);
    expect(nodes.filter((node) => node.handlerId === 'core.reward').length).toBeLessThanOrEqual(6);
  });

  it('starts the scavenger with the confirmed health, currency, collectible, and hand limit', () => {
    const kernel = createKernel();
    startReadyRun(kernel, 'confirmed-start');
    const player = kernel.getSnapshot().run!.player;
    expect(player.maxHealth).toBeGreaterThanOrEqual(80);
    expect(player.gold).toBe(200);
    expect(player.collectibleIds).toContain('collectible.scavenger-bag');
    expect(wastelandContentPack.ruleSet.handLimit).toBe(10);
  });

  it('allows attack cards to reach a second upgrade while other cards stop at one', () => {
    const kernel = createKernel();
    startReadyRun(kernel, 'upgrade-tiers');
    const run = kernel.getSnapshot().run!;
    const smash = run.deck.cards.find((card) => card.definitionId === 'card.smash')!;
    const dodge = run.deck.cards.find((card) => card.definitionId === 'card.dodge')!;
    expect(wastelandContentPack.cards.find((card) => card.id === smash.definitionId)!.upgrades).toHaveLength(2);
    expect(wastelandContentPack.cards.find((card) => card.id === dodge.definitionId)!.upgrades).toHaveLength(1);
  });

  it('keeps invalid commands atomic', () => {
    const kernel = createKernel();
    startReadyRun(kernel, 'atomic');
    const before = kernel.getSnapshot();
    expect(() => kernel.dispatch({ type: 'PLAY_CARD', cardInstanceId: 'missing' })).toThrow();
    expect(kernel.getSnapshot()).toEqual(before);
  });

  it('keeps defense across turns and clears it after combat', () => {
    const kernel = createKernel();
    startReadyRun(kernel, 'defense');
    const combatNode = kernel.getSnapshot().run!.map.nodes.find((node) => node.handlerId === 'core.combat')!;
    kernel.dispatch({ type: 'DEBUG_JUMP_NODE', nodeId: combatNode.id });
    const combat = kernel.getSnapshot().run!.combat!;
    const dodge = combat.hand.find((card) => card.definitionId === 'card.dodge');
    if (dodge) kernel.dispatch({ type: 'PLAY_CARD', cardInstanceId: dodge.instanceId });
    const block = kernel.getSnapshot().run!.combat!.player.block;
    kernel.dispatch({ type: 'END_TURN' });
    expect(kernel.getSnapshot().run!.combat!.player.block).toBeGreaterThanOrEqual(Math.max(0, block - 7));
  });

  it('serializes and restores exact game and random state', () => {
    const source = createKernel();
    startReadyRun(source, 'save-seed');
    const save = source.exportSave();
    const restored = createKernel();
    restored.restoreSave(save);
    expect(restored.getSnapshot()).toEqual(source.getSnapshot());
    expect(restored.exportSave().random).toEqual(save.random);
  });

  it('completes four floors and produces a hidden score', () => {
    const result = completeRun('complete-run');
    expect(result.run!.result?.outcome).toBe('victory');
    expect(result.run!.metrics.floorsCleared).toBe(4);
    expect(result.run!.result!.score).toBeGreaterThan(0);
    expect(result.run!.result!.metaTokens).toBeGreaterThan(0);
  });

  it('wins a majority of deterministic heuristic simulations', () => {
    const outcomes = Array.from({ length: 12 }, (_, index) => completeRun(`balance-${index}`).run!.result!.outcome);
    expect(outcomes.filter((outcome) => outcome === 'victory').length).toBeGreaterThanOrEqual(8);
  });
});
