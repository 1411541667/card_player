import { describe, expect, it } from 'vitest';
import { ContentRegistry } from '../../src/game/content';
import { wastelandContentPack } from '../../src/content/wasteland';
import { createCoreEffectRegistry } from '../../src/game/effects';
import { GameKernel } from '../../src/game/kernel';
import { createCoreNodeHandlers } from '../../src/game/nodes';
import type { GameSnapshot } from '../../src/game/types';
import { cardCost } from '../../src/game/cards';

function preferenceOf(handlerId: string): number {
  return ['core.reward', 'core.event', 'core.rest', 'core.shop', 'core.combat', 'core.boss'].indexOf(handlerId);
}

function guaranteedRouteStartCount(nodes: readonly { id: string; layer: number; handlerId: string; connections: string[] }[]): number {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const boss = nodes.find((node) => node.handlerId === 'core.boss')!;
  const seen = new Set<string>();
  const walk = (nodeId: string, shops: number, rewards: number, rests: number): boolean => {
    const node = byId.get(nodeId)!;
    if (node.id === boss.id) return shops >= 1 && rewards >= 1 && rests >= 2;
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    const ok = node.connections.some((id) => walk(
      id,
      shops + (node.handlerId === 'core.shop' ? 1 : 0),
      rewards + (node.handlerId === 'core.reward' ? 1 : 0),
      rests + (node.handlerId === 'core.rest' ? 1 : 0),
    ));
    seen.delete(node.id);
    return ok;
  };
  return nodes.filter((node) => node.layer === 0 && walk(node.id, 0, 0, 0)).length;
}

function createKernel() {
  const effects = createCoreEffectRegistry();
  const content = new ContentRegistry(structuredClone(wastelandContentPack), effects);
  return new GameKernel(content, effects, createCoreNodeHandlers());
}

function startReadyRun(kernel: GameKernel, seed: string, characterId = 'character.scavenger'): void {
  kernel.dispatch({ type: 'NEW_RUN', seed });
  kernel.dispatch({ type: 'SELECT_CHARACTER', characterId });
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

function completeRun(seed: string, characterId = 'character.scavenger'): GameSnapshot {
  const kernel = createKernel();
  startReadyRun(kernel, seed, characterId);
  let steps = 0;
  while (kernel.getSnapshot().phase !== 'result' && steps < 2000) {
    steps += 1;
    const snapshot = kernel.getSnapshot();
    if (snapshot.phase === 'map') {
      const available = snapshot.run!.map.nodes.filter((node) => node.available && !node.visited);
      available.sort((left, right) => preferenceOf(left.handlerId) - preferenceOf(right.handlerId));
      kernel.dispatch({ type: 'ENTER_NODE', nodeId: available[0].id });
    } else if (snapshot.phase === 'combat') playCombat(kernel);
    else if (snapshot.phase === 'reward') chooseReward(kernel);
    else if (snapshot.phase === 'shop') kernel.dispatch({ type: 'LEAVE_SHOP' });
    else if (snapshot.phase === 'rest') kernel.dispatch({ type: 'CHOOSE_REST', option: 'heal' });
    else if (snapshot.phase === 'event') {
      const event = wastelandContentPack.events.find((item) => item.id === snapshot.run!.event!.definitionId)!;
      const affordable = event.options.find((option) => (option.healthCost ?? 0) < snapshot.run!.player.health && (option.goldCost ?? 0) <= snapshot.run!.player.gold);
      kernel.dispatch({ type: 'CHOOSE_EVENT', optionId: (affordable ?? event.options[event.options.length - 1]).id });
    }
  }
  expect(steps).toBeLessThan(2000);
  return kernel.getSnapshot();
}

describe('Wasteland GameKernel', () => {
  it('creates deterministic maps with 48–60 nodes, one boss, and the confirmed shop/reward counts', () => {
    const first = createKernel();
    const second = createKernel();
    startReadyRun(first, 'same-seed');
    startReadyRun(second, 'same-seed');
    expect(first.getSnapshot().run!.map).toEqual(second.getSnapshot().run!.map);
    const nodes = first.getSnapshot().run!.map.nodes;
    expect(nodes.length).toBeGreaterThanOrEqual(60);
    expect(nodes.length).toBeLessThanOrEqual(72);
    expect(nodes.filter((node) => node.handlerId === 'core.boss')).toHaveLength(1);
    expect(nodes.filter((node) => node.handlerId === 'core.shop').length).toBeGreaterThanOrEqual(4);
    expect(nodes.filter((node) => node.handlerId === 'core.shop').length).toBeLessThanOrEqual(5);
    expect(nodes.filter((node) => node.handlerId === 'core.reward').length).toBeGreaterThanOrEqual(8);
    expect(nodes.filter((node) => node.handlerId === 'core.reward').length).toBeLessThanOrEqual(10);
    expect(nodes.filter((node) => node.handlerId === 'core.elite')).toHaveLength(5);
    const restCount = nodes.filter((node) => node.handlerId === 'core.rest').length;
    expect(restCount).toBeGreaterThanOrEqual(6);
    expect(restCount).toBeLessThanOrEqual(8);
    expect(guaranteedRouteStartCount(nodes)).toBeGreaterThanOrEqual(2);
    const perRow = new Map<number, number>();
    for (const node of nodes) perRow.set(node.layer, (perRow.get(node.layer) ?? 0) + 1);
    expect(Math.max(...perRow.values())).toBeLessThanOrEqual(wastelandContentPack.ruleSet.map.maxNodesPerRow);
    // The row right before the boss is entirely rest nodes.
    const bossLayer = Math.max(...nodes.map((node) => node.layer));
    const preBoss = nodes.filter((node) => node.layer === bossLayer - 1);
    expect(preBoss.length).toBeGreaterThan(0);
    expect(preBoss.every((node) => node.handlerId === 'core.rest')).toBe(true);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const node of nodes) {
      for (const connectionId of node.connections) expect(byId.get(connectionId)!.layer).toBe(node.layer + 1);
    }
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

  it('requires an explicit rest choice and supports healing or one card upgrade', () => {
    const kernel = createKernel();
    startReadyRun(kernel, 'rest-choice');
    const restNode = kernel.getSnapshot().run!.map.nodes.find((node) => node.handlerId === 'core.rest')!;
    kernel.dispatch({ type: 'DEBUG_JUMP_NODE', nodeId: restNode.id });
    expect(kernel.getSnapshot().phase).toBe('rest');
    const before = kernel.getSnapshot().run!.player.health;
    expect(() => kernel.dispatch({ type: 'CHOOSE_REST', option: 'upgrade' })).toThrow();
    expect(kernel.getSnapshot().phase).toBe('rest');
    kernel.dispatch({ type: 'CHOOSE_REST', option: 'heal' });
    expect(kernel.getSnapshot().phase).toBe('map');
    expect(kernel.getSnapshot().run!.player.health).toBeGreaterThanOrEqual(before);

    kernel.dispatch({ type: 'DEBUG_JUMP_NODE', nodeId: restNode.id });
    const card = kernel.getSnapshot().run!.deck.cards.find((candidate) => candidate.upgradeLevel < 2)!;
    kernel.dispatch({ type: 'CHOOSE_REST', option: 'upgrade', cardInstanceId: card.instanceId });
    expect(kernel.getSnapshot().phase).toBe('map');
    expect(kernel.getSnapshot().run!.deck.cards.find((candidate) => candidate.instanceId === card.instanceId)!.upgradeLevel).toBe(card.upgradeLevel + 1);
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

  it('spawns fixed multi-enemy squads on floors 2–4 while floor 1 stays single-enemy', () => {
    const kernel = createKernel();
    startReadyRun(kernel, 'multi-enemy');
    let guard = 0;
    while (kernel.getSnapshot().run!.floor < 2 && guard < 2000) {
      guard += 1;
      const snapshot = kernel.getSnapshot();
      if (snapshot.phase === 'map') {
        const available = snapshot.run!.map.nodes.filter((node) => node.available && !node.visited);
        available.sort((left, right) => preferenceOf(left.handlerId) - preferenceOf(right.handlerId));
        kernel.dispatch({ type: 'ENTER_NODE', nodeId: available[0].id });
      } else if (snapshot.phase === 'combat') playCombat(kernel);
      else if (snapshot.phase === 'reward') chooseReward(kernel);
      else if (snapshot.phase === 'shop') kernel.dispatch({ type: 'LEAVE_SHOP' });
      else if (snapshot.phase === 'rest') kernel.dispatch({ type: 'CHOOSE_REST', option: 'heal' });
      else if (snapshot.phase === 'event') {
        const event = wastelandContentPack.events.find((item) => item.id === snapshot.run!.event!.definitionId)!;
        const affordable = event.options.find((option) => (option.healthCost ?? 0) < snapshot.run!.player.health && (option.goldCost ?? 0) <= snapshot.run!.player.gold);
        kernel.dispatch({ type: 'CHOOSE_EVENT', optionId: (affordable ?? event.options[event.options.length - 1]).id });
      }
    }
    expect(kernel.getSnapshot().run!.floor).toBe(2);
    const floor2Combat = kernel.getSnapshot().run!.map.nodes.find((node) => node.handlerId === 'core.combat')!;
    kernel.dispatch({ type: 'DEBUG_JUMP_NODE', nodeId: floor2Combat.id });
    expect(kernel.getSnapshot().run!.combat!.enemies).toHaveLength(2);
  });

  it('wins a majority of deterministic heuristic simulations', () => {
    const outcomes = Array.from({ length: 12 }, (_, index) => completeRun(`balance-${index}`).run!.result!.outcome);
    expect(outcomes.filter((outcome) => outcome === 'victory').length).toBeGreaterThanOrEqual(8);
  });

  it('selects the hunter with serum resource, starting deck, and exclusive collectible', () => {
    const kernel = createKernel();
    startReadyRun(kernel, 'hunter-start', 'character.hunter');
    const player = kernel.getSnapshot().run!.player;
    expect(player.characterId).toBe('character.hunter');
    expect(player.maxHealth).toBe(60);
    expect(player.resourcePerTurn.serum).toBeGreaterThanOrEqual(3);
    expect(player.collectibleIds).toEqual(['collectible.hunter-strap']);
    expect(kernel.getSnapshot().run!.deck.cards.map((card) => card.definitionId)).toEqual([
      'card.stab', 'card.stab', 'card.stab', 'card.stab',
      'card.hunter-dodge', 'card.hunter-dodge', 'card.hunter-dodge', 'card.hunter-dodge',
      'card.trap-setup', 'card.conceal',
    ]);
  });

  it('hunter conceal frees the first attack card of each turn', () => {
    const kernel = createKernel();
    startReadyRun(kernel, 'hunter-conceal', 'character.hunter');
    const combatNode = kernel.getSnapshot().run!.map.nodes.find((node) => node.handlerId === 'core.combat')!;
    kernel.dispatch({ type: 'DEBUG_JUMP_NODE', nodeId: combatNode.id });
    kernel.dispatch({ type: 'DEBUG_SET_RESOURCE', resourceId: 'serum', amount: 99 });

    const serum = () => kernel.getSnapshot().run!.combat!.player.resources.serum;
    const play = (definitionId: string): number => {
      const combat = kernel.getSnapshot().run!.combat!;
      const card = combat.hand.find((candidate) => candidate.definitionId === definitionId);
      if (!card) return -1;
      const before = serum();
      kernel.dispatch({ type: 'PLAY_CARD', cardInstanceId: card.instanceId, targetId: combat.enemies.find((enemy) => enemy.health > 0)?.instanceId });
      return before - serum();
    };

    let concealed = false;
    let firstFreeStab = -1;
    for (let guard = 0; guard < 10; guard += 1) {
      kernel.dispatch({ type: 'DEBUG_SET_RESOURCE', resourceId: 'serum', amount: 99 });
      if (!concealed) concealed = play('card.conceal') !== -1;
      if (concealed && firstFreeStab === -1) firstFreeStab = play('card.stab');
      if (concealed && firstFreeStab !== -1) break;
      kernel.dispatch({ type: 'END_TURN' });
    }
    expect(concealed).toBe(true);
    expect(firstFreeStab).toBe(0); // the first attack card played after conceal is free

    // Any further attack card in the same hand pays its normal serum cost; skills are never concealed.
    kernel.dispatch({ type: 'DEBUG_SET_RESOURCE', resourceId: 'serum', amount: 99 });
    const combat = kernel.getSnapshot().run!.combat!;
    const targetId = combat.enemies.find((enemy) => enemy.health > 0)?.instanceId;
    const secondStab = combat.hand.find((candidate) => candidate.definitionId === 'card.stab');
    if (secondStab) {
      const before = serum();
      kernel.dispatch({ type: 'PLAY_CARD', cardInstanceId: secondStab.instanceId, targetId });
      expect(before - serum()).toBe(1);
    }
    const trap = combat.hand.find((candidate) => candidate.definitionId === 'card.trap-setup');
    if (trap) {
      const before = serum();
      kernel.dispatch({ type: 'PLAY_CARD', cardInstanceId: trap.instanceId, targetId });
      expect(before - serum()).toBe(2);
    }
  });

  it('the hunter shoulder strap grants strength when an attack is fully blocked', () => {
    const kernel = createKernel();
    startReadyRun(kernel, 'hunter-strap', 'character.hunter');
    const combatNode = kernel.getSnapshot().run!.map.nodes.find((node) => node.handlerId === 'core.combat')!;
    kernel.dispatch({ type: 'DEBUG_JUMP_NODE', nodeId: combatNode.id });

    let strongGained = false;
    for (let guard = 0; guard < 8 && !strongGained; guard += 1) {
      kernel.dispatch({ type: 'DEBUG_SET_RESOURCE', resourceId: 'serum', amount: 99 });
      const combat = kernel.getSnapshot().run!.combat!;
      for (const card of [...combat.hand]) {
        if (card.definitionId === 'card.hunter-dodge') kernel.dispatch({ type: 'PLAY_CARD', cardInstanceId: card.instanceId });
      }
      kernel.dispatch({ type: 'END_TURN' });
      const statuses = kernel.getSnapshot().run!.combat!.player.statuses;
      strongGained = (statuses.find((status) => status.definitionId === 'status.strong')?.stacks ?? 0) >= 1;
    }
    expect(strongGained).toBe(true);
  });

  it('the hunter completes a seeded four-floor run', () => {
    const result = completeRun('hunter-run', 'character.hunter');
    expect(result.run!.result?.outcome).toBe('victory');
    expect(result.run!.metrics.floorsCleared).toBe(4);
  });
});
