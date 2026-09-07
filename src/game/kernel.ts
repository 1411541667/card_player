import type { ContentRegistry } from './content';
import type { EffectRegistry } from './effects';
import { cardCost, cardEffects, maxUpgradeLevel } from './cards';
import type { NodeHandlerRegistry, NodeResolution } from './nodes';
import { NamespacedRandom } from './random';
import type {
  CardInstance,
  CardType,
  CombatState,
  DomainEvent,
  EffectInvocation,
  EffectOperation,
  EnemyState,
  GameCommand,
  GameSnapshot,
  GameState,
  MapNodeState,
  MapState,
  PlayerState,
  RandomState,
  RunSaveV2,
  RunState,
  ShopOfferState,
  StatusInstance,
  TriggerHook,
} from './types';

type Listener = (snapshot: GameSnapshot, events: readonly DomainEvent[]) => void;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class GameKernel {
  private state: GameState;
  private random: NamespacedRandom;
  private readonly listeners = new Set<Listener>();
  private readonly eventLog: DomainEvent[] = [];
  private pendingEvents: DomainEvent[] = [];

  constructor(
    readonly content: ContentRegistry,
    private readonly effects: EffectRegistry,
    private readonly nodeHandlers: NodeHandlerRegistry,
    restored?: { game: GameState; random: RandomState },
  ) {
    for (const node of content.pack.nodes) {
      if (!nodeHandlers.has(node.handlerId)) throw new Error(`Unregistered node handler: ${node.handlerId}`);
    }
    this.state = restored ? clone(restored.game) : { phase: 'menu', revision: 0 };
    this.random = new NamespacedRandom(restored?.random ?? 'not-started');
  }

  getSnapshot(): GameSnapshot {
    return clone(this.state);
  }

  resetToMenu(): void {
    this.state = { phase: 'menu', revision: this.state.revision + 1 };
    this.random = new NamespacedRandom('not-started');
    const event = { type: 'flow.menu', payload: {}, revision: this.state.revision } as DomainEvent;
    this.eventLog.push(event);
    for (const listener of this.listeners) listener(this.getSnapshot(), [event]);
  }

  getEventLog(): readonly DomainEvent[] {
    return clone(this.eventLog);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot(), []);
    return () => this.listeners.delete(listener);
  }

  dispatch(command: GameCommand): readonly DomainEvent[] {
    const previousState = clone(this.state);
    const previousRandom = this.random.exportState();
    this.pendingEvents = [];
    try {
      this.handle(command);
      this.state.revision += 1;
      this.pendingEvents = this.pendingEvents.map((event) => ({ ...event, revision: this.state.revision }));
      this.eventLog.push(...this.pendingEvents);
      if (this.eventLog.length > 500) this.eventLog.splice(0, this.eventLog.length - 500);
      const snapshot = this.getSnapshot();
      for (const listener of this.listeners) listener(snapshot, clone(this.pendingEvents));
      return clone(this.pendingEvents);
    } catch (error) {
      this.state = previousState;
      this.random = new NamespacedRandom(previousRandom);
      this.pendingEvents = [];
      throw error;
    }
  }

  exportSave(): RunSaveV2 {
    if (!this.state.run) throw new Error('There is no active or completed run to save.');
    return {
      schemaVersion: 2,
      contentPackId: this.content.pack.id,
      contentPackVersion: this.content.pack.version,
      savedAt: new Date().toISOString(),
      game: clone(this.state),
      random: this.random.exportState(),
    };
  }

  restoreSave(save: RunSaveV2): void {
    if (save.schemaVersion !== 2) throw new Error(`Unsupported save schema: ${String(save.schemaVersion)}`);
    if (save.contentPackId !== this.content.pack.id || save.contentPackVersion !== this.content.pack.version) {
      throw new Error(`Save requires content pack ${save.contentPackId}@${save.contentPackVersion}.`);
    }
    this.state = clone(save.game);
    this.random = new NamespacedRandom(save.random);
    this.pendingEvents = [{ type: 'save.restored', payload: {}, revision: this.state.revision }];
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot, clone(this.pendingEvents));
  }

  private handle(command: GameCommand): void {
    switch (command.type) {
      case 'NEW_RUN': this.beginRunSelection(command.seed); break;
      case 'SELECT_CHARACTER': this.selectCharacter(command.characterId); break;
      case 'SELECT_BOON': this.selectBoon(command.boonId); break;
      case 'REMOVE_STARTING_CARD': this.removeStartingCard(command.cardInstanceId); break;
      case 'SELECT_THEME': this.selectTheme(command.themeId); break;
      case 'ENTER_NODE': this.enterNode(command.nodeId); break;
      case 'PLAY_CARD': this.playCard(command.cardInstanceId, command.targetId); break;
      case 'END_TURN': this.endTurn(); break;
      case 'CHOOSE_REWARD': this.chooseReward(command.rewardOfferId); break;
      case 'BUY_CARD': this.buyCard(command.offerId); break;
      case 'BUY_SHOP_OFFER': this.buyShopOffer(command.offerId, command.cardInstanceId); break;
      case 'LEAVE_SHOP': this.leaveShop(); break;
      case 'CHOOSE_EVENT': this.chooseEvent(command.optionId, command.cardInstanceId); break;
      case 'CHOOSE_REST': this.chooseRest(command.option, command.cardInstanceId); break;
      case 'RETURN_TO_MENU': this.state = { phase: 'menu', revision: this.state.revision }; this.emit('flow.menu', {}); break;
      case 'DEBUG_SET_RESOURCE': this.debugSetResource(command.resourceId, command.amount); break;
      case 'DEBUG_JUMP_NODE': this.debugJumpNode(command.nodeId); break;
      case 'DEBUG_START_EVENT': this.debugStartEvent(command.eventId); break;
      case 'DEBUG_WIN_COMBAT': this.debugWinCombat(); break;
      case 'DEBUG_JUMP_FLOOR': this.debugJumpFloor(command.floor); break;
      case 'DRAW_MAP': this.drawMap(command.x, command.y, command.color); break;
      case 'ERASE_MAP': this.eraseMap(command.x, command.y); break;
      case 'CLEAR_MAP_DRAWING': this.clearMapDrawing(); break;
      default: command satisfies never;
    }
  }

  private beginRunSelection(seedInput?: string): void {
    if (this.state.phase !== 'menu' && this.state.phase !== 'result') throw new Error('A run can only start from menu or result.');
    const seed = seedInput?.trim() || `${Date.now()}`;
    this.random = new NamespacedRandom(seed);
    this.state = { phase: 'character-select', pendingSeed: seed, revision: this.state.revision };
    this.emit('setup.started', { seed });
  }

  private selectCharacter(characterId: string): void {
    if (this.state.phase !== 'character-select' || !this.state.pendingSeed) throw new Error('A character can only be selected during run setup.');
    const rules = this.content.pack.ruleSet;
    const character = this.content.characters.get(characterId);
    if (!character) throw new Error(`Character is unavailable: ${characterId}`);
    const seed = this.state.pendingSeed;
    const deckIds = character.startingDeck.length ? character.startingDeck : rules.startingDeck;
    const deck: CardInstance[] = deckIds.map((definitionId, index) => ({
      instanceId: `starter-${index}-${definitionId}`,
      definitionId,
      upgradeLevel: 0,
    }));
    const player: PlayerState = {
      characterId: character.id,
      health: character.maxHealth,
      maxHealth: character.maxHealth,
      block: 0,
      gold: rules.startingGold,
      resources: Object.fromEntries(Object.keys(rules.resources).map((id) => [id, 0])),
      resourcePerTurn: Object.fromEntries(Object.entries(rules.resources).map(([id, definition]) => [id, definition.perTurn])),
      statuses: [],
      relicIds: [],
      collectibleIds: [...(character.startingCollectibleIds ?? rules.startingCollectibleIds)],
    };
    const run: RunState = {
      id: `run-${seed}`,
      seed,
      floor: 1,
      totalFloors: rules.map.floorCount,
      phase: 'boon-select',
      player,
      deck: { cards: deck },
      map: { nodes: [], drawings: {} },
      metrics: { battlesWon: 0, bossesDefeated: 0, nodesVisited: 0, floorsCleared: 0, damageTaken: 0, battlesStarted: 0 },
      setup: {
        boonOffers: this.random.shuffle('setup:boons', rules.startingBoonIds).slice(0, 3),
        pendingCardRemovals: 0,
      },
      encounteredEnemyIds: [],
    };
    this.state = { phase: 'boon-select', run, revision: this.state.revision };
    this.emit('setup.characterSelected', { characterId });
  }

  private selectBoon(boonId: string): void {
    const run = this.requirePhase('boon-select');
    if (!run.setup?.boonOffers.includes(boonId)) throw new Error(`Starting boon is not offered: ${boonId}`);
    run.setup.selectedBoonId = boonId;
    if (boonId === 'boon.max-card') {
      const eligible = run.deck.cards.filter((card) => maxUpgradeLevel(this.content.cards.get(card.definitionId)!) > 0);
      const selected = this.random.pick('setup:max-card', eligible);
      selected.upgradeLevel = maxUpgradeLevel(this.content.cards.get(selected.definitionId)!);
      this.emit('deck.cardUpgraded', { cardInstanceId: selected.instanceId, definitionId: selected.definitionId });
    } else if (boonId === 'boon.max-health') {
      run.player.maxHealth = Math.ceil(run.player.maxHealth * 1.3);
      run.player.health = run.player.maxHealth;
    } else if (boonId === 'boon.gold-shop') {
      run.player.gold += 100;
      this.startShop('theme-select');
      this.emit('setup.boonSelected', { boonId });
      return;
    } else if (boonId === 'boon.resource') {
      const character = this.content.characters.get(run.player.characterId)!;
      run.player.resourcePerTurn[character.resourceId] = (run.player.resourcePerTurn[character.resourceId] ?? 0) + 1;
    } else if (boonId === 'boon.greedy-coin') {
      this.gainCollectible('collectible.greedy-coin');
    } else if (boonId === 'boon.remove-three') {
      run.setup.pendingCardRemovals = 3;
      (run as RunState).phase = 'boon-remove';
      this.state.phase = 'boon-remove';
      this.emit('setup.boonSelected', { boonId });
      return;
    } else {
      throw new Error(`Unknown starting boon: ${boonId}`);
    }
    (run as RunState).phase = 'theme-select';
    this.state.phase = 'theme-select';
    this.emit('setup.boonSelected', { boonId });
  }

  private removeStartingCard(cardInstanceId: string): void {
    const run = this.requirePhase('boon-remove');
    const index = run.deck.cards.findIndex((card) => card.instanceId === cardInstanceId);
    if (index < 0) throw new Error(`Starting card not found: ${cardInstanceId}`);
    const minimum = this.content.pack.ruleSet.shop.removal.minimumDeckSize;
    if (run.deck.cards.length <= minimum) throw new Error(`The deck cannot contain fewer than ${minimum} cards.`);
    const removed = run.deck.cards[index];
    run.deck.cards.splice(index, 1);
    run.setup!.pendingCardRemovals -= 1;
    this.emit('setup.cardRemoved', { cardInstanceId, definitionId: removed.definitionId, remaining: run.setup!.pendingCardRemovals });
    if (run.setup!.pendingCardRemovals <= 0) {
      (run as RunState).phase = 'theme-select';
      this.state.phase = 'theme-select';
    }
  }

  private selectTheme(themeId: string): void {
    const run = this.requirePhase('theme-select');
    if (themeId !== 'theme.dust') throw new Error(`Theme is unavailable: ${themeId}`);
    run.setup!.themeId = themeId;
    run.map = this.generateMap(1);
    (run as RunState).phase = 'map';
    this.state.phase = 'map';
    this.emit('run.started', { seed: run.seed, characterId: run.player.characterId, themeId });
  }

  private generateMap(floor: number): MapState {
    const { minNodes, maxNodes, rows, maxNodesPerRow, shopCount, rewardCount, eliteCount, restCount, remainingWeights } = this.content.pack.ruleSet.map;
    if (floor === 4) {
      const fixedHandlers = ['core.event', 'core.shop', 'core.boss'] as const;
      const fixedNodes = fixedHandlers.map((handlerId, layer) => {
        const definitions = this.content.pack.nodes.filter((node) => node.handlerId === handlerId && (!node.floors || node.floors.includes(floor)));
        if (definitions.length === 0) throw new Error(`No node definition for ${handlerId} on floor ${floor}.`);
        const definition = handlerId === 'core.event'
          ? definitions.find((candidate) => candidate.eventPool?.includes('event.piece-truth')) ?? definitions[0]
          : definitions[0];
        return {
          id: `floor-${floor}-node-${layer}-0`, layer, column: 0, definitionId: definition.id, handlerId,
          connections: layer < fixedHandlers.length - 1 ? [`floor-${floor}-node-${layer + 1}-0`] : [],
          visited: false, available: layer === 0, iconKey: this.mapIconKey(handlerId, floor),
        } satisfies MapNodeState;
      });
      return { nodes: fixedNodes, drawings: {} };
    }

    const targetCount = this.random.integer(`map:${floor}:count`, minNodes, maxNodes);
    const regularCount = targetCount - 1;
    const shops = this.random.integer(`map:${floor}:shops`, shopCount.min, shopCount.max);
    const rewards = this.random.integer(`map:${floor}:rewards`, rewardCount.min, rewardCount.max);
    const elites = eliteCount;

    // One row holds at most maxNodesPerRow nodes, so the board grows tall (rows of 4-5 nodes)
    // instead of wide; the player scrolls the route and enters the boss at the bottom.
    const routeRows = Math.min(rows, Math.max(3, Math.ceil(regularCount / Math.max(1, maxNodesPerRow))));
    const rowCounts = Array.from({ length: routeRows }, (_, index) =>
      Math.floor(regularCount / routeRows) + (index < regularCount % routeRows ? 1 : 0));
    const maxWidth = Math.max(...rowCounts);
    const centerColumn = (maxWidth - 1) / 2;

    // The row right above the boss is always a rest stop, so every route rests right before the
    // boss battle. Two more rests sit on the guaranteed spines; any extra fill the rest budget.
    const preBossRests = rowCounts[routeRows - 1];
    const restTarget = this.random.integer(`map:${floor}:rests`, restCount.min, restCount.max);
    const extraRests = Math.max(0, restTarget - preBossRests - 2);
    const restsTotal = preBossRests + 2 + extraRests;

    const remaining = regularCount - shops - rewards - elites - restsTotal;
    if (remaining < 2) throw new Error('Map fixed node counts must leave room for combat and event nodes.');
    const weightTotal = remainingWeights.combat + remainingWeights.event;
    const combats = Math.max(elites, Math.round(remaining * remainingWeights.combat / weightTotal));
    const events = remaining - combats;
    if (events < 0) throw new Error('Map node counts leave no room for event nodes.');
    const normalCombats = combats - elites;

    // Build the raw node slots (handler assigned later); boss occupies the final slot.
    interface BuildNode { layer: number; column: number; handlerId?: string }
    const build: BuildNode[] = [];
    for (let layer = 0; layer <= routeRows; layer += 1) {
      const isBoss = layer === routeRows;
      const count = isBoss ? 1 : rowCounts[layer];
      for (let column = 0; column < count; column += 1) {
        build.push({
          layer,
          column: count === 1 ? Math.floor(maxWidth / 2) : Math.round((column / Math.max(1, count - 1)) * (maxWidth - 1)),
        });
      }
    }
    const bossIndex = build.length - 1;
    build[bossIndex].handlerId = 'core.boss';
    for (const node of build) {
      if (node.layer === routeRows - 1) node.handlerId = 'core.rest';
    }

    const nearestUnassigned = (layer: number, column: number, exclude?: BuildNode): BuildNode | undefined => build
      .filter((node) => node.layer === layer && node.handlerId === undefined && node !== exclude)
      .sort((left, right) => Math.abs(left.column - column) - Math.abs(right.column - column))[0];

    // Two guaranteed spines to the boss; each spine carries rest/shop/reward/combat across four
    // interior layers spread over the board. Combined with the pre-boss rest row, each spine route
    // holds at least 1 shop, 1 reward and 2 rests.
    const spineBases = [Math.max(0, Math.floor(maxWidth * 0.15)), Math.min(maxWidth - 1, Math.floor(maxWidth * 0.85))];
    const spineLayers = Array.from({ length: 4 }, (_, index) => 1 + Math.round(((routeRows - 3) * index) / 3));
    const spineA: BuildNode[] = [];
    const spineB: BuildNode[] = [];
    const startA = nearestUnassigned(0, spineBases[0]);
    const startB = nearestUnassigned(0, spineBases[1], startA);
    if (!startA || !startB || startA === startB) throw new Error('Map could not allocate guaranteed boss routes.');
    spineA.push(startA);
    spineB.push(startB);
    for (const layer of spineLayers) {
      const t = routeRows <= 1 ? 0 : layer / routeRows;
      const columnA = Math.max(0, Math.min(rowCounts[layer] - 1, Math.round(spineBases[0] + (centerColumn - spineBases[0]) * t)));
      const columnB = Math.max(0, Math.min(rowCounts[layer] - 1, Math.round(spineBases[1] + (centerColumn - spineBases[1]) * t)));
      const nodeA = nearestUnassigned(layer, columnA);
      const nodeB = nearestUnassigned(layer, columnB, nodeA);
      if (!nodeA || !nodeB || nodeA === nodeB) throw new Error('Map could not allocate guaranteed boss routes.');
      spineA.push(nodeA);
      spineB.push(nodeB);
    }
    const spineHandlersA = ['core.rest', 'core.shop', 'core.reward', 'core.combat'];
    const spineHandlersB = ['core.rest', 'core.reward', 'core.shop', 'core.combat'];
    for (let index = 0; index < 4; index += 1) {
      spineA[index + 1].handlerId = spineHandlersA[index];
      spineB[index + 1].handlerId = spineHandlersB[index];
    }

    // Five elite battles, confined to three interior layers so no single route meets more than three.
    const eliteLayers = [1, 1, 2, 2, 3];
    for (const layer of eliteLayers) {
      const pool = build.filter((node) => node.layer === layer && node.handlerId === undefined);
      const node = this.random.pick(`map:${floor}:elite:${layer}`, pool);
      node.handlerId = 'core.elite';
    }

    // Remaining shops/rewards plus any extra rests land on random unassigned interior slots.
    const extras = this.random.shuffle(`map:${floor}:extras`, [
      ...Array.from({ length: Math.max(0, shops - 2) }, () => 'core.shop'),
      ...Array.from({ length: Math.max(0, rewards - 2) }, () => 'core.reward'),
      ...Array.from({ length: extraRests }, () => 'core.rest'),
    ]);
    for (const handlerId of extras) {
      const pool = build.filter((node) => node.handlerId === undefined && node.layer !== 0 && node.layer !== routeRows);
      const node = this.random.pick(`map:${floor}:extra:${handlerId}`, pool);
      node.handlerId = handlerId;
    }

    // Everything else: 40% combat (minus the elites already placed), 60% event.
    const fillPool = this.random.shuffle(`map:${floor}:fill`, build.filter((node) => node.handlerId === undefined));
    fillPool.forEach((node, index) => {
      node.handlerId = index < normalCombats ? 'core.combat' : 'core.event';
    });

    const nodes: MapNodeState[] = build.map((slot, index) => {
      const isBoss = index === bossIndex;
      const handlerId = slot.handlerId ?? 'core.combat';
      const definitions = this.content.pack.nodes.filter((node) => node.handlerId === handlerId && (!node.floors || node.floors.includes(floor)));
      if (definitions.length === 0) throw new Error(`No node definition for ${handlerId} on floor ${floor}.`);
      const definition = this.random.pick(`map:${floor}:definition:${slot.layer}:${slot.column}`, definitions);
      return {
        id: `floor-${floor}-node-${slot.layer}-${slot.column}`,
        layer: slot.layer,
        column: slot.column,
        definitionId: definition.id,
        handlerId,
        connections: [],
        visited: false,
        available: slot.layer === 0 && !isBoss,
        iconKey: this.mapIconKey(handlerId, floor),
      };
    });

    for (let layer = 0; layer < routeRows; layer += 1) {
      const current = nodes.filter((node) => node.layer === layer);
      const next = nodes.filter((node) => node.layer === layer + 1);
      const orderedCurrent = [...current].sort((left, right) => left.column - right.column);
      const orderedNext = [...next].sort((left, right) => left.column - right.column);
      // Build a monotone bipartite mapping. Both endpoints of an edge are ordered,
      // so no two links between adjacent layers can cross or overlap.
      orderedCurrent.forEach((node, index) => {
        const targetIndex = orderedCurrent.length <= 1 ? 0 : Math.round(index * (orderedNext.length - 1) / (orderedCurrent.length - 1));
        node.connections = [orderedNext[targetIndex].id];
      });
      orderedNext.forEach((target, index) => {
        const sourceIndex = orderedNext.length <= 1 ? 0 : Math.round(index * (orderedCurrent.length - 1) / (orderedNext.length - 1));
        const source = orderedCurrent[sourceIndex];
        if (!source.connections.includes(target.id)) source.connections.push(target.id);
      });
    }

    // Re-assert authored guaranteed routes, then remove only optional edges that
    // would cross them. Mandatory routes are kept in their original order.
    const mandatoryEdges = new Set<string>();
    for (const spine of [spineA, spineB]) {
      for (let index = 0; index < spine.length - 1; index += 1) {
        let from = nodes.find((node) => node.layer === spine[index].layer && node.column === spine[index].column);
        const destination = nodes.find((node) => node.layer === spine[index + 1].layer && node.column === spine[index + 1].column);
        if (!from || !destination) continue;
        for (let layer = from.layer + 1; layer <= destination.layer; layer += 1) {
          const to = layer === destination.layer ? destination : [...nodes].filter((node) => node.layer === layer).sort((left, right) => Math.abs(left.column - from!.column) - Math.abs(right.column - from!.column))[0];
          if (!to) break;
          if (!from.connections.includes(to.id)) from.connections.push(to.id);
          mandatoryEdges.add(`${from.id}->${to.id}`);
          from = to;
        }
      }
    }
    const crosses = (aFrom: MapNodeState, aTo: MapNodeState, bFrom: MapNodeState, bTo: MapNodeState) =>
      (aFrom.column < bFrom.column && aTo.column > bTo.column) || (aFrom.column > bFrom.column && aTo.column < bTo.column);
    for (let layer = 0; layer < routeRows; layer += 1) {
      const kept: Array<{ from: MapNodeState; to: MapNodeState; mandatory: boolean }> = [];
      for (const from of nodes.filter((node) => node.layer === layer)) {
        for (const connectionId of [...from.connections]) {
          const to = nodes.find((node) => node.id === connectionId);
          if (!to) continue;
          const mandatory = mandatoryEdges.has(`${from.id}->${to.id}`);
          const conflicts = kept.filter((edge) => crosses(from, to, edge.from, edge.to));
          if (conflicts.length === 0) kept.push({ from, to, mandatory });
          else if (mandatory) {
            conflicts.filter((edge) => !edge.mandatory).forEach((edge) => {
              const incoming = nodes.filter((candidate) => candidate.connections.includes(edge.to.id)).length;
              if (edge.from.connections.length > 1 && incoming > 1) edge.from.connections = edge.from.connections.filter((id) => id !== edge.to.id);
            });
            kept.push({ from, to, mandatory });
          } else if (kept.some((edge) => edge.mandatory && crosses(from, to, edge.from, edge.to))) {
            const incoming = nodes.filter((candidate) => candidate.connections.includes(connectionId)).length;
            if (from.connections.length > 1 && incoming > 1) from.connections = from.connections.filter((id) => id !== connectionId);
          }
        }
      }
    }
    for (const node of nodes) {
      for (const connectionId of node.connections) {
        const target = nodes.find((candidate) => candidate.id === connectionId);
        if (!target || target.layer !== node.layer + 1) throw new Error(`Map connection must target the next layer: ${node.id} -> ${connectionId}`);
      }
    }
    return { nodes, drawings: {} };
  }

  private mapIconKey(handlerId: string, floor: number): string {
    if (handlerId === 'core.boss') return `map.boss-${floor}`;
    return ({
      'core.combat': 'map.combat', 'core.elite': 'map.elite', 'core.shop': 'map.shop',
      'core.event': 'map.event', 'core.reward': 'map.reward', 'core.rest': 'map.rest',
    } as Record<string, string>)[handlerId] ?? 'map.unknown';
  }

  private enterNode(nodeId: string): void {
    const run = this.requirePhase('map');
    const node = run.map.nodes.find((candidate) => candidate.id === nodeId);
    if (!node || !node.available || node.visited) throw new Error(`Map node is not available: ${nodeId}`);
    run.map.nodes.forEach((candidate) => { candidate.available = false; });
    node.visited = true;
    run.metrics.nodesVisited += 1;
    run.map.currentNodeId = node.id;
    for (const connectionId of node.connections) {
      const connection = run.map.nodes.find((candidate) => candidate.id === connectionId);
      if (connection) connection.available = true;
    }
    const definition = this.content.nodes.get(node.definitionId);
    if (!definition) throw new Error(`Unknown node definition: ${node.definitionId}`);
    const resolution = this.nodeHandlers.resolve(node.handlerId, {
      node, definition, content: this.content, random: this.random,
    });
    this.emit('map.nodeEntered', { nodeId, handlerId: node.handlerId });
    this.resolveNode(resolution);
  }

  private resolveNode(resolution: NodeResolution): void {
    switch (resolution.type) {
      case 'combat': this.startCombat(resolution.encounterId); break;
      case 'shop': this.startShop('map'); break;
      case 'event': {
        const run = this.requireRun();
        run.phase = 'event'; run.event = { definitionId: resolution.eventId }; this.state.phase = 'event';
        this.emit('event.started', { eventId: resolution.eventId });
        break;
      }
      case 'reward': {
        const run = this.requireRun();
        const rewardDefinitionId = this.random.pick(`node:${run.map.currentNodeId}:fixed-reward`, resolution.rewardIds);
        run.reward = {
          offers: [{ id: 'reward-0', rewardDefinitionId }],
          source: 'node', continuation: 'map', canSkip: false,
        };
        run.phase = 'reward'; this.state.phase = 'reward';
        this.emit('reward.started', { source: 'node' });
        break;
      }
      case 'rest': {
        const run = this.requireRun();
        run.rest = { nodeId: run.map.currentNodeId };
        run.phase = 'rest'; this.state.phase = 'rest';
        this.emit('rest.started', {});
        break;
      }
      default: resolution satisfies never;
    }
  }

  private startCombat(encounterId: string): void {
    const run = this.requireRun();
    const encounter = this.content.encounters.get(encounterId);
    if (!encounter) throw new Error(`Unknown encounter: ${encounterId}`);
    let enemyIds = [...encounter.enemyIds];
    const enemyCount = Math.max(1, encounter.enemyCount ?? 1);
    if (encounter.category === 'normal' || encounter.category === 'elite') {
      const openingPool = new Set(['enemy.dirty-dog', 'enemy.sick-dog', 'enemy.wanderer', 'enemy.dried-person']);
      if (run.floor === 1 && run.metrics.nodesVisited <= 4) {
        const restricted = enemyIds.filter((id) => openingPool.has(id));
        if (restricted.length > 0) enemyIds = restricted;
      }
      const unseen = enemyIds.filter((id) => !(run.encounteredEnemyIds ?? []).includes(id));
      const pool = unseen.length > 0 ? unseen : enemyIds;
      enemyIds = [];
      for (let index = 0; index < enemyCount; index += 1) {
        enemyIds.push(this.random.pick(`encounter:${encounterId}:${run.metrics.battlesStarted}:${index}:enemy`, pool));
      }
    } else if (enemyIds.length === 0) {
      throw new Error(`Encounter has no enemies: ${encounterId}`);
    }
    run.encounteredEnemyIds ??= [];
    for (const enemyId of enemyIds) if (!run.encounteredEnemyIds.includes(enemyId)) run.encounteredEnemyIds.push(enemyId);
    const enemies: EnemyState[] = enemyIds.map((definitionId, index) => {
      const definition = this.content.enemies.get(definitionId);
      if (!definition) throw new Error(`Unknown enemy: ${definitionId}`);
      return { instanceId: `enemy-${index}-${definitionId}`, definitionId, health: definition.maxHealth, block: 0, statuses: [], intentIndex: 0 };
    });
    const player = clone(run.player);
    player.block = 0;
    player.statuses = player.statuses.filter((status) => status.scope === 'run');
    const combat: CombatState = {
      encounterId, turn: 1, activeSide: 'player', player, enemies,
      drawPile: this.random.shuffle(`combat:${encounterId}:deck`, run.deck.cards),
      hand: [], discardPile: [], exhaustPile: [],
      cardsDrawn: 0,
      angerAttacksUsed: 0,
      concealAttacksUsed: 0,
    };
    run.metrics.battlesStarted += 1;
    run.combat = combat; run.phase = 'combat'; this.state.phase = 'combat';
    this.resetPlayerResources(combat.player);
    this.runTriggers('combatStart');
    this.drawCards(this.content.pack.ruleSet.handSize);
    this.runTriggers('turnStart');
    this.emit('combat.started', { encounterId });
  }

  private playCard(cardInstanceId: string, targetId?: string): void {
    const run = this.requirePhase('combat');
    const combat = run.combat!;
    if (combat.activeSide !== 'player') throw new Error('Cards can only be played during the player turn.');
    const cardIndex = combat.hand.findIndex((card) => card.instanceId === cardInstanceId);
    if (cardIndex < 0) throw new Error(`Card is not in hand: ${cardInstanceId}`);
    const card = combat.hand[cardIndex];
    const definition = this.content.cards.get(card.definitionId);
    if (!definition) throw new Error(`Unknown card: ${card.definitionId}`);
    const baseCost = cardCost(definition, card);
    const clarity = definition.type === 'skill' ? this.statusStacks(combat.player.statuses, 'status.clear') : 0;
    const concealStacks = this.statusStacks(combat.player.statuses, 'status.conceal');
    const concealedAttack = definition.type === 'attack' && concealStacks > (combat.concealAttacksUsed ?? 0);
    const cost = { ...baseCost, amount: Math.max(0, baseCost.amount - clarity) };
    if (concealedAttack) cost.amount = 0;
    const available = combat.player.resources[cost.resourceId];
    if (available === undefined || available < cost.amount) throw new Error('Not enough resource to play this card.');
    let target: string | 'player' | undefined;
    if (definition.target === 'enemy') {
      const enemy = combat.enemies.find((candidate) => candidate.instanceId === targetId && candidate.health > 0);
      if (!enemy) throw new Error('A living enemy target is required.');
      target = enemy.instanceId;
    } else if (definition.target === 'self') {
      target = 'player';
    }
    combat.player.resources[cost.resourceId] -= cost.amount;
    this.executeInvocations(cardEffects(definition, card), 'player', target, undefined, definition.type);
    if (definition.type === 'attack') {
      combat.angerAttacksUsed = (combat.angerAttacksUsed ?? 0) + 1;
      if (concealedAttack) combat.concealAttacksUsed = (combat.concealAttacksUsed ?? 0) + 1;
    }
    combat.hand.splice(cardIndex, 1);
    (definition.playDestination === 'exhaust' ? combat.exhaustPile : combat.discardPile).push(card);
    this.emit('card.played', { cardInstanceId, definitionId: definition.id, targetId: target });
    this.runTriggers('afterCardPlayed', definition.tags ?? []);
    this.checkCombatEnd();
  }

  private endTurn(): void {
    const run = this.requirePhase('combat');
    const combat = run.combat!;
    if (combat.activeSide !== 'player') throw new Error('The player turn is not active.');
    this.runTriggers('turnEnd');
    this.tickStatusDurations(combat.player.statuses);
    if (this.content.pack.ruleSet.turn.discardHandAtEnd) combat.discardPile.push(...combat.hand.splice(0));
    combat.activeSide = 'enemy';
    for (const enemy of combat.enemies) {
      if (enemy.health <= 0) continue;
      if (this.content.pack.ruleSet.turn.clearBlockAtStart) enemy.block = 0;
      const definition = this.content.enemies.get(enemy.definitionId)!;
      run.lastEnemyId = definition.id;
      const intent = definition.intents[enemy.intentIndex % definition.intents.length];
      const target = intent.target === 'enemy' ? 'player' : intent.target === 'self' ? enemy.instanceId : undefined;
      this.executeInvocations(intent.effects, enemy.instanceId, target, undefined, 'attack');
      this.tickStatusDurations(enemy.statuses);
      enemy.intentIndex = (enemy.intentIndex + 1) % definition.intents.length;
      this.emit('enemy.acted', { enemyId: enemy.instanceId, intentId: intent.id });
      if (combat.player.health <= 0) break;
    }
    if (this.checkCombatEnd()) return;
    combat.turn += 1;
    combat.angerAttacksUsed = 0;
    combat.concealAttacksUsed = 0;
    combat.activeSide = 'player';
    if (this.content.pack.ruleSet.turn.clearBlockAtStart) combat.player.block = 0;
    this.resetPlayerResources(combat.player);
    this.drawCards(this.content.pack.ruleSet.handSize - combat.hand.length);
    this.runTriggers('turnStart');
    this.emit('turn.started', { turn: combat.turn });
  }

  private drawCards(amount: number): void {
    const combat = this.requireRun().combat;
    if (!combat) throw new Error('Cards can only be drawn during combat.');
    for (let index = 0; index < amount; index += 1) {
      if (combat.hand.length >= this.content.pack.ruleSet.handLimit) break;
      if (combat.drawPile.length === 0 && combat.discardPile.length > 0) {
        combat.drawPile = this.random.shuffle(`combat:${combat.encounterId}:reshuffle:${combat.turn}`, combat.discardPile.splice(0));
        this.emit('deck.reshuffled', {});
      }
      const card = combat.drawPile.pop();
      if (!card) break;
      combat.hand.push(card);
      combat.cardsDrawn += 1;
      this.emit('card.drawn', { cardInstanceId: card.instanceId });
      this.runTriggers('afterCardDrawn', [], combat.cardsDrawn);
    }
  }

  private resetPlayerResources(player: PlayerState): void {
    for (const [id, definition] of Object.entries(this.content.pack.ruleSet.resources)) {
      player.resources[id] = definition.maximum === undefined
        ? (player.resourcePerTurn[id] ?? definition.perTurn)
        : Math.min(definition.maximum, player.resourcePerTurn[id] ?? definition.perTurn);
    }
  }

  private executeInvocations(invocations: readonly EffectInvocation[], source: 'player' | string, target?: 'player' | string, stacks?: number, cardType?: CardType): void {
    const run = this.requireRun();
    const sourceState = source === 'player' ? (run.combat?.player ?? run.player) : run.combat?.enemies.find((enemy) => enemy.instanceId === source);
    const angerApplies = source === 'player' && cardType === 'attack' && this.statusStacks(sourceState?.statuses ?? [], 'status.anger') > 0 && (run.combat?.angerAttacksUsed ?? 0) === 0;
    for (const invocation of invocations) {
      const handler = this.effects.get(invocation.effectId);
      const params = { ...(invocation.params ?? {}) };
      if (invocation.effectId === 'core.damage' && cardType === 'attack' && typeof params.amount === 'number') {
        if (source === 'player') params.amount += this.statusStacks(sourceState?.statuses ?? [], 'status.strong');
        if (angerApplies) params.amount *= 2;
        if (this.statusStacks(sourceState?.statuses ?? [], 'status.weak') > 0) params.amount = Math.floor(params.amount * 0.75);
      }
      if (invocation.effectId === 'core.block' && cardType === 'defense' && typeof params.amount === 'number' && source === 'player') {
        params.amount += this.statusStacks(sourceState?.statuses ?? [], 'status.sharp');
      }
      const operations = handler({
        snapshot: this.getSnapshot(), source, target, stacks,
        random: (namespace) => this.random.next(`effect:${invocation.effectId}:${namespace}`),
      }, params);
      for (const operation of operations) this.applyOperation(operation);
    }
  }

  private applyOperation(operation: EffectOperation): void {
    const run = this.requireRun();
    const player = run.combat?.player ?? run.player;
    const operationTarget = 'target' in operation ? operation.target : undefined;
    const target = operationTarget === undefined
      ? undefined
      : operationTarget === 'player' ? player : run.combat?.enemies.find((enemy) => enemy.instanceId === operationTarget);
    switch (operation.type) {
      case 'damage': {
        if (!target) throw new Error(`Damage target not found: ${operation.target}`);
        const absorbed = Math.min(target.block, Math.max(0, operation.amount));
        target.block -= absorbed;
        const dealt = Math.max(0, operation.amount - absorbed);
        target.health = Math.max(0, target.health - dealt);
        if (operation.target === 'player') {
          run.metrics.damageTaken += dealt;
          if (absorbed > 0 && dealt === 0) this.runTriggers('afterDamageBlocked');
        }
        this.emit('effect.damage', { target: operation.target, amount: operation.amount, absorbed });
        break;
      }
      case 'block':
        if (!target) throw new Error(`Block target not found: ${operation.target}`);
        target.block += Math.max(0, operation.amount); this.emit('effect.block', { target: operation.target, amount: operation.amount }); break;
      case 'draw': this.drawCards(Math.max(0, Math.floor(operation.amount))); break;
      case 'gainResource': {
        if (!(operation.resourceId in player.resources)) throw new Error(`Unknown player resource: ${operation.resourceId}`);
        const maximum = this.content.pack.ruleSet.resources[operation.resourceId]?.maximum;
        player.resources[operation.resourceId] += operation.amount;
        if (maximum !== undefined) player.resources[operation.resourceId] = Math.min(maximum, player.resources[operation.resourceId]);
        this.emit('effect.resource', { resourceId: operation.resourceId, amount: operation.amount }); break;
      }
      case 'heal':
        if (!target) throw new Error(`Heal target not found: ${operation.target}`);
        target.health = Math.min(
          'maxHealth' in target ? target.maxHealth : (this.content.enemies.get(target.definitionId)?.maxHealth ?? Number.POSITIVE_INFINITY),
          target.health + Math.max(0, operation.amount),
        );
        this.emit('effect.heal', { target: operation.target, amount: operation.amount }); break;
      case 'gainGold': player.gold += operation.amount; this.emit('effect.gold', { amount: operation.amount }); break;
      case 'addStatus':
        if (!target) throw new Error(`Status target not found: ${operation.target}`);
        this.addStatus(target.statuses, operation.statusId, operation.stacks, operation.duration, 'combat');
        this.emit('effect.status', { target: operation.target, statusId: operation.statusId, stacks: operation.stacks }); break;
      case 'healPercent': {
        if (!target) throw new Error(`Heal target not found: ${operation.target}`);
        const maximum = 'maxHealth' in target ? target.maxHealth : (this.content.enemies.get(target.definitionId)?.maxHealth ?? target.health);
        const amount = Math.ceil(maximum * operation.percent);
        target.health = Math.min(maximum, target.health + amount);
        this.emit('effect.heal', { target: operation.target, amount });
        break;
      }
      case 'gainCollectible': this.gainCollectible(operation.collectibleId); break;
      case 'gainRandomCollectible': {
        const pool = this.content.pack.collectibles.filter((item) => item.kind === 'positive' && !run.player.collectibleIds.includes(item.id));
        if (pool.length > 0) this.gainCollectible(this.random.pick(`event:collectible:${this.state.revision}`, pool).id);
        break;
      }
      case 'addRunStatus':
        this.addStatus(run.player.statuses, operation.statusId, operation.stacks, undefined, 'run');
        if (run.combat) this.addStatus(run.combat.player.statuses, operation.statusId, operation.stacks, undefined, 'run');
        this.emit('effect.runStatus', { statusId: operation.statusId, stacks: operation.stacks });
        break;
      case 'upgradeRandomCards': {
        const eligible = run.deck.cards.filter((card) => {
          const definition = this.content.cards.get(card.definitionId);
          return Boolean(definition) && (operation.cardTag === 'any' || definition!.tags?.includes(operation.cardTag)) && card.upgradeLevel < maxUpgradeLevel(definition!);
        });
        const selected = this.random.shuffle(`upgrade:${operation.cardTag}:${this.state.revision}`, eligible).slice(0, Math.max(0, Math.floor(operation.count)));
        selected.forEach((card) => { card.upgradeLevel = Math.min(card.upgradeLevel + 1, maxUpgradeLevel(this.content.cards.get(card.definitionId)!)); });
        this.emit('deck.cardsUpgraded', { cardInstanceIds: selected.map((card) => card.instanceId) });
        break;
      }
      case 'multiplyGoldRandom': {
        const before = player.gold;
        const multiplier = this.random.next(`collectible:gold:${this.state.revision}`) < operation.upChance
          ? operation.upMultiplier : operation.downMultiplier;
        player.gold = Math.ceil(player.gold * multiplier);
        this.emit('effect.goldMultiplied', { before, after: player.gold, multiplier });
        break;
      }
      default: operation satisfies never;
    }
    if (!run.combat) run.player = player;
  }

  private gainCollectible(collectibleId: string): void {
    const run = this.requireRun();
    const definition = this.content.collectibles.get(collectibleId);
    if (!definition) throw new Error(`Unknown collectible: ${collectibleId}`);
    if (run.player.collectibleIds.includes(collectibleId)) return;
    run.player.collectibleIds.push(collectibleId);
    if (run.combat) run.combat.player.collectibleIds = [...run.player.collectibleIds];
    this.executeInvocations(definition.onAcquire ?? [], 'player', 'player');
    this.emit('collectible.gained', { collectibleId });
  }

  private addStatus(statuses: StatusInstance[], statusId: string, stacks: number, duration?: number, scope: 'combat' | 'run' = 'combat'): void {
    const definition = this.content.statuses.get(statusId);
    if (!definition) throw new Error(`Unknown status: ${statusId}`);
    const current = statuses.find((status) => status.definitionId === statusId);
    if (current) {
      current.stacks = definition.stacking === 'stack' ? current.stacks + stacks : stacks;
      if (duration !== undefined) current.duration = (current.duration ?? 0) + duration;
      if (scope === 'run') current.scope = 'run';
    } else statuses.push({ definitionId: statusId, stacks, duration, scope });
  }

  private statusStacks(statuses: readonly StatusInstance[], statusId: string): number {
    return statuses.find((status) => status.definitionId === statusId)?.stacks ?? 0;
  }

  private tickStatusDurations(statuses: StatusInstance[]): void {
    for (const status of statuses) {
      if (status.duration === undefined) continue;
      status.duration -= 1;
      if (status.definitionId === 'status.weak') status.stacks = Math.max(0, status.stacks - 1);
    }
    for (let index = statuses.length - 1; index >= 0; index -= 1) {
      if ((statuses[index].duration ?? 1) <= 0 || statuses[index].stacks <= 0) statuses.splice(index, 1);
    }
  }

  private runTriggers(hook: TriggerHook, cardTags: readonly string[] = [], occurrence = 0): void {
    const run = this.requireRun();
    const player = run.combat?.player ?? run.player;
    for (const relicId of player.relicIds) {
      const relic = this.content.relics.get(relicId);
      if (relic?.triggers?.[hook]) this.executeInvocations(relic.triggers[hook]!, 'player', 'player');
    }
    for (const status of [...player.statuses]) {
      const definition = this.content.statuses.get(status.definitionId);
      if (definition?.triggers?.[hook]) this.executeInvocations(definition.triggers[hook]!, 'player', 'player', status.stacks);
    }
    for (const collectibleId of player.collectibleIds) {
      const collectible = this.content.collectibles.get(collectibleId);
      for (const trigger of collectible?.triggers ?? []) {
        if (trigger.hook !== hook || (trigger.cardTag && !cardTags.includes(trigger.cardTag))) continue;
        if (trigger.every && (occurrence <= 0 || occurrence % trigger.every !== 0)) continue;
        this.executeInvocations(trigger.effects, 'player', 'player');
      }
    }
    for (const enemy of run.combat?.enemies ?? []) {
      for (const status of [...enemy.statuses]) {
        const definition = this.content.statuses.get(status.definitionId);
        if (definition?.triggers?.[hook]) this.executeInvocations(definition.triggers[hook]!, enemy.instanceId, enemy.instanceId, status.stacks);
      }
    }
  }

  private checkCombatEnd(): boolean {
    const run = this.requireRun();
    const combat = run.combat;
    if (!combat) return false;
    if (combat.player.health <= 0) {
      run.player = clone(combat.player); run.combat = undefined;
      run.phase = 'result'; run.result = this.calculateResult('defeat', run.lastEnemyId);
      this.state.phase = 'result'; this.emit('run.completed', { outcome: 'defeat' }); return true;
    }
    if (combat.enemies.every((enemy) => enemy.health <= 0)) {
      this.runTriggers('combatEnd');
      const encounterId = combat.encounterId;
      run.player = clone(combat.player); run.combat = undefined;
      run.player.block = 0;
      run.player.statuses = run.player.statuses.filter((status) => status.scope === 'run');
      run.metrics.battlesWon += 1;
      if (run.pendingCollectibleId) {
        const collectibleId = run.pendingCollectibleId;
        run.pendingCollectibleId = undefined;
        this.gainCollectible(collectibleId);
      }
      const encounter = this.content.encounters.get(encounterId)!;
      if (encounter.category === 'normal') {
        const gold = this.random.integer(`combat:${encounterId}:${run.metrics.battlesWon}:gold`, this.content.pack.ruleSet.normalCombatGold.min, this.content.pack.ruleSet.normalCombatGold.max);
        run.player.gold += gold;
        this.emit('combat.goldAwarded', { encounterId, amount: gold });
        this.returnToMap();
        this.emit('combat.won', { encounterId });
        return true;
      }
      if (encounter.category === 'special') {
        this.returnToMap();
        this.emit('combat.won', { encounterId });
        return true;
      }
      if (encounter.category === 'elite') {
        run.player.gold += 100;
        this.emit('combat.goldAwarded', { encounterId, amount: 100 });
        this.returnToMap();
        this.emit('combat.won', { encounterId });
        return true;
      }
      if (encounter.category === 'boss') {
        run.metrics.bossesDefeated += 1;
        run.metrics.floorsCleared += 1;
        if (run.floor >= run.totalFloors) {
          const result = this.calculateResult('victory');
          run.phase = 'result';
          run.result = result;
          this.state.phase = 'result';
          this.emit('run.completed', { outcome: 'victory', score: result?.score ?? 0 });
          return true;
        }
      }
      const pool = encounter.rewardPool?.length ? encounter.rewardPool : this.content.pack.rewards.map((reward) => reward.id);
      const count = Math.min(this.content.pack.ruleSet.rewardChoiceCount, pool.length);
      run.reward = {
        offers: this.random.shuffle(`reward:${run.floor}:${encounterId}`, pool).slice(0, count).map((rewardDefinitionId, index) => ({ id: `reward-${index}`, rewardDefinitionId })),
        source: encounter.category,
        continuation: encounter.category === 'boss' ? (run.floor < run.totalFloors ? 'next-floor' : 'result') : 'map',
        canSkip: false,
      };
      run.phase = 'reward'; this.state.phase = 'reward'; this.emit('combat.won', { encounterId }); return true;
    }
    return false;
  }

  private chooseReward(rewardOfferId?: string): void {
    const run = this.requirePhase('reward');
    const rewardState = run.reward!;
    if (!rewardOfferId && !rewardState.canSkip) throw new Error('This reward must be collected.');
    if (rewardOfferId) {
      const offer = run.reward?.offers.find((candidate) => candidate.id === rewardOfferId);
      if (!offer) throw new Error(`Reward is not offered: ${rewardOfferId}`);
      const reward = this.content.rewards.get(offer.rewardDefinitionId);
      if (!reward) throw new Error(`Unknown reward: ${offer.rewardDefinitionId}`);
      if (reward.type === 'currency') run.player.gold += reward.amount ?? 0;
      if (reward.type === 'healing') run.player.health = Math.min(run.player.maxHealth, run.player.health + Math.ceil(run.player.maxHealth * (reward.amount ?? 0)));
      if (reward.type === 'collectible' && reward.collectibleId) this.gainCollectible(reward.collectibleId);
      if (reward.type === 'card' && reward.cardId) run.deck.cards.push(this.createCardInstance(reward.cardId));
      this.emit('reward.chosen', { rewardDefinitionId: reward.id });
    } else {
      this.emit('reward.skipped', {});
    }
    if (rewardState.continuation === 'map') {
      this.returnToMap();
    } else if (rewardState.continuation === 'next-floor') {
      run.reward = undefined;
      run.floor += 1;
      run.map = this.generateMap(run.floor);
      (run as RunState).phase = 'map'; this.state.phase = 'map';
      this.emit('floor.started', { floor: run.floor });
    } else {
      run.reward = undefined;
      const result = this.calculateResult('victory');
      (run as RunState).phase = 'result'; run.result = result;
      this.state.phase = 'result';
      this.emit('run.completed', { outcome: 'victory', score: result?.score ?? 0 });
    }
  }

  private startShop(returnPhase: 'map' | 'theme-select'): void {
    const run = this.requireRun();
    const rules = this.content.pack.ruleSet.shop;
    const namespace = run.map.currentNodeId ?? `setup:${run.seed}`;
    const shopCards = this.content.pack.cards.filter((card) => card.rarity !== 'red');
    const count = Math.min(rules.cardOfferCount, shopCards.length);
    const cards = this.random.shuffle(`shop:${namespace}:cards`, shopCards).slice(0, count);
    const offers: ShopOfferState[] = cards.map((card, index) => {
      const range = rules.cardPriceRanges?.[card.rarity ?? 'gray'] ?? { min: rules.cardPriceMin, max: rules.cardPriceMax };
      return {
        id: `offer-card-${index}`, type: 'card' as const, cardDefinitionId: card.id,
        basePrice: this.random.integer(`shop:${namespace}:card-price:${index}`, range.min, range.max),
        priceStep: 0, purchaseCount: 0, soldOut: false,
      };
    });
    const exclusiveCollectibleIds = new Set([
      ...this.content.pack.characters.flatMap((character) => character.startingCollectibleIds ?? []),
      ...this.content.pack.ruleSet.startingCollectibleIds,
      'collectible.greedy-coin',
    ]);
    const collectiblePool = this.content.pack.collectibles.filter((item) => item.kind === 'positive' && !exclusiveCollectibleIds.has(item.id) && !run.player.collectibleIds.includes(item.id));
    for (const [index, collectible] of this.random.shuffle(`shop:${namespace}:collectibles`, collectiblePool).slice(0, rules.collectibleOfferCount).entries()) {
      const range = rules.collectiblePriceRanges?.[collectible.rarity ?? 'blue'] ?? { min: rules.collectiblePriceMin, max: rules.collectiblePriceMax };
      offers.push({
        id: `offer-collectible-${index}`, type: 'collectible', collectibleId: collectible.id,
        basePrice: this.random.integer(`shop:${namespace}:collectible-price:${index}`, range.min, range.max),
        priceStep: 0, purchaseCount: 0, soldOut: false,
      });
    }
    run.shop = { offers: [
      ...offers,
      { id: 'offer-heal', type: 'heal', amount: rules.healing.percent, basePrice: rules.healing.basePrice, priceStep: rules.healing.priceStep, purchaseCount: 0, soldOut: false },
      { id: 'offer-remove', type: 'remove', basePrice: rules.removal.basePrice, priceStep: rules.removal.priceStep, purchaseCount: 0, soldOut: false },
      { id: 'offer-upgrade', type: 'upgrade', basePrice: rules.upgrade.basePrice, priceStep: rules.upgrade.priceStep, purchaseCount: 0, soldOut: false },
    ], returnPhase };
    run.phase = 'shop'; this.state.phase = 'shop'; this.emit('shop.started', {});
  }

  private buyCard(offerId: string): void {
    this.buyShopOffer(offerId);
  }

  private buyShopOffer(offerId: string, cardInstanceId?: string): void {
    const run = this.requirePhase('shop');
    const offer = run.shop?.offers.find((candidate) => candidate.id === offerId);
    if (!offer || offer.soldOut) throw new Error(`Shop offer is unavailable: ${offerId}`);
    const price = offer.basePrice + offer.priceStep * offer.purchaseCount;
    if (run.player.gold < price) throw new Error('Not enough gold.');
    if ((offer.type === 'remove' || offer.type === 'upgrade') && !cardInstanceId) throw new Error('This shop service requires a deck card.');
    const selected = cardInstanceId ? run.deck.cards.find((card) => card.instanceId === cardInstanceId) : undefined;
    if (cardInstanceId && !selected) throw new Error(`Deck card not found: ${cardInstanceId}`);
    const minimumDeckSize = this.content.pack.ruleSet.shop.removal.minimumDeckSize;
    if (offer.type === 'remove' && run.deck.cards.length <= minimumDeckSize) throw new Error(`The deck cannot contain fewer than ${minimumDeckSize} cards.`);
    if (offer.type === 'upgrade' && selected && selected.upgradeLevel >= maxUpgradeLevel(this.content.cards.get(selected.definitionId)!)) throw new Error('This card is already fully upgraded.');
    run.player.gold -= price;
    if (offer.type === 'card' && offer.cardDefinitionId) run.deck.cards.push(this.createCardInstance(offer.cardDefinitionId));
    if (offer.type === 'collectible' && offer.collectibleId) this.gainCollectible(offer.collectibleId);
    if (offer.type === 'heal') run.player.health = Math.min(run.player.maxHealth, run.player.health + Math.ceil(run.player.maxHealth * (offer.amount ?? 0)));
    if (offer.type === 'remove' && selected) run.deck.cards.splice(run.deck.cards.indexOf(selected), 1);
    if (offer.type === 'upgrade' && selected) selected.upgradeLevel += 1;
    offer.purchaseCount += 1;
    if (offer.type === 'card' || offer.type === 'collectible') offer.soldOut = true;
    this.emit('shop.purchased', { offerId, type: offer.type, price, cardInstanceId, definitionId: selected?.definitionId });
  }

  private chooseEvent(optionId: string, cardInstanceId?: string): void {
    const run = this.requirePhase('event');
    const definition = this.content.events.get(run.event!.definitionId)!;
    const option = definition.options.find((candidate) => candidate.id === optionId);
    if (!option) throw new Error(`Unknown event option: ${optionId}`);
    if (option.recordsBloodLetterCondition && !run.player.collectibleIds.includes('collectible.blood-letter')) throw new Error('需要持有沾染血迹的信。');
    const selectedCard = cardInstanceId ? run.deck.cards.find((card) => card.instanceId === cardInstanceId) : undefined;
    if (option.requiresCardChoice && !selectedCard) throw new Error('该选项需要选择一张牌。');
    const goldCost = option.recordsBloodLetterCondition ? 0 : (option.goldCost ?? 0);
    if (option.healthCost && run.player.health <= option.healthCost) throw new Error('生命值不足以选择该选项。');
    if (goldCost && run.player.gold < goldCost) throw new Error('商店代币不足以选择该选项。');
    run.player.health -= option.healthCost ?? 0;
    run.player.gold -= goldCost;
    this.executeInvocations(option.effects, 'player', 'player');
    if (option.recordsBloodLetterCondition) run.bloodLetterConditionRecorded = true;
    if (option.requiresCardChoice && selectedCard) {
      if (option.transformsCard) {
        const previousDefinitionId = selectedCard.definitionId;
        const candidates = this.content.pack.cards.filter((card) => card.id !== selectedCard.definitionId);
        if (candidates.length > 0) {
          selectedCard.definitionId = this.random.pick(`event:${definition.id}:${option.id}:transform`, candidates).id;
          selectedCard.upgradeLevel = 0;
          this.emit('deck.cardTransformed', { cardInstanceId: selectedCard.instanceId, previousDefinitionId, definitionId: selectedCard.definitionId });
        }
      } else {
        const cardDefinition = this.content.cards.get(selectedCard.definitionId)!;
        if (selectedCard.upgradeLevel >= maxUpgradeLevel(cardDefinition)) throw new Error('所选卡牌已经强化至最高等级。');
        selectedCard.upgradeLevel += 1;
        this.emit('deck.cardUpgraded', { cardInstanceId: selectedCard.instanceId, definitionId: selectedCard.definitionId });
      }
    }
    this.emit('event.chosen', { eventId: definition.id, optionId });
    if (option.encounterId) {
      run.pendingCollectibleId = option.guaranteedCollectibleId;
      run.event = undefined;
      this.startCombat(option.encounterId);
      return;
    }
    if (option.guaranteedCollectibleId) this.gainCollectible(option.guaranteedCollectibleId);
    this.returnToMap();
  }

  private chooseRest(option: 'heal' | 'upgrade', cardInstanceId?: string): void {
    const run = this.requirePhase('rest');
    if (option === 'heal') {
      const amount = Math.max(1, Math.ceil(run.player.maxHealth * 0.3));
      run.player.health = Math.min(run.player.maxHealth, run.player.health + amount);
      run.rest = undefined;
      this.emit('rest.used', { percent: 0.3, amount });
      this.returnToMap();
      return;
    }
    if (!cardInstanceId) throw new Error('升级卡牌需要选择一张卡牌。');
    const card = run.deck.cards.find((candidate) => candidate.instanceId === cardInstanceId);
    if (!card) throw new Error(`Deck card not found: ${cardInstanceId}`);
    const definition = this.content.cards.get(card.definitionId)!;
    if (card.upgradeLevel >= maxUpgradeLevel(definition)) throw new Error('所选卡牌已经强化至最高等级。');
    card.upgradeLevel += 1;
    run.rest = undefined;
    this.emit('rest.upgraded', { cardInstanceId, definitionId: definition.id });
    this.returnToMap();
  }

  private leaveShop(): void {
    const run = this.requirePhase('shop');
    if (run.shop?.returnPhase === 'theme-select') {
      run.shop = undefined;
      (run as RunState).phase = 'theme-select';
      this.state.phase = 'theme-select';
      this.emit('flow.themeSelect', {});
      return;
    }
    this.returnToMap();
  }

  private returnToMap(): void {
    const run = this.requireRun();
    run.phase = 'map'; run.reward = undefined; run.shop = undefined; run.event = undefined; run.rest = undefined;
    this.state.phase = 'map'; this.emit('flow.map', {});
  }

  private debugSetResource(resourceId: string, amount: number): void {
    const run = this.requireRun();
    if (!(resourceId in run.player.resources)) throw new Error(`Unknown resource: ${resourceId}`);
    run.player.resources[resourceId] = amount;
    if (run.combat) run.combat.player.resources[resourceId] = amount;
    this.emit('debug.resourceSet', { resourceId, amount });
  }

  private debugJumpNode(nodeId: string): void {
    const run = this.requireRun();
    const node = run.map.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`Unknown map node: ${nodeId}`);
    run.combat = undefined; run.reward = undefined; run.shop = undefined; run.event = undefined; run.rest = undefined;
    run.phase = 'map'; this.state.phase = 'map';
    run.map.nodes.forEach((candidate) => { candidate.available = false; });
    node.available = true; node.visited = false;
    this.enterNode(nodeId);
    this.emit('debug.jumped', { nodeId });
  }

  private drawMap(x: number, y: number, color: 'red' | 'blue'): void {
    const run = this.requirePhase('map');
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('无效的绘图坐标。');
    const key = `${Math.round(x / 3) * 3},${Math.round(y / 3) * 3}`;
    run.map.drawings ??= {};
    if (Object.keys(run.map.drawings).length >= 12000 && !run.map.drawings[key]) return;
    run.map.drawings[key] = color;
    this.emit('map.drawingChanged', { action: 'draw', key });
  }

  private eraseMap(x: number, y: number): void {
    const run = this.requirePhase('map');
    const drawings = run.map.drawings ?? {};
    const centerX = Math.round(x / 3) * 3;
    const centerY = Math.round(y / 3) * 3;
    for (const key of Object.keys(drawings)) {
      const [px, py] = key.split(',').map(Number);
      if (Math.hypot(px - centerX, py - centerY) <= 32) delete drawings[key];
    }
    run.map.drawings = drawings;
    this.emit('map.drawingChanged', { action: 'erase' });
  }

  private clearMapDrawing(): void {
    const run = this.requirePhase('map');
    run.map.drawings = {};
    this.emit('map.drawingChanged', { action: 'clear' });
  }

  private debugStartEvent(eventId: string): void {
    const run = this.requireRun();
    if (!this.content.events.has(eventId)) throw new Error(`Unknown event: ${eventId}`);
    run.combat = undefined; run.reward = undefined; run.shop = undefined; run.rest = undefined;
    run.event = { definitionId: eventId };
    run.phase = 'event'; this.state.phase = 'event';
    this.emit('debug.eventStarted', { eventId });
  }

  private debugWinCombat(): void {
    const run = this.requirePhase('combat');
    if (!run.combat) throw new Error('当前没有进行中的战斗。');
    run.combat.enemies.forEach((enemy) => { enemy.health = 0; enemy.block = 0; });
    this.emit('debug.combatWon', { encounterId: run.combat.encounterId });
    this.checkCombatEnd();
  }

  private debugJumpFloor(floor: number): void {
    const run = this.requireRun();
    if (!Number.isInteger(floor) || floor < 1 || floor > run.totalFloors) throw new Error(`层数必须在 1 到 ${run.totalFloors} 之间。`);
    run.floor = floor;
    run.combat = undefined; run.reward = undefined; run.shop = undefined; run.event = undefined; run.rest = undefined; run.result = undefined;
    run.map = this.generateMap(floor);
    run.phase = 'map'; this.state.phase = 'map';
    this.emit('debug.floorJumped', { floor });
  }

  private createCardInstance(definitionId: string): CardInstance {
    const run = this.requireRun();
    return { instanceId: `card-${run.deck.cards.length}-${this.state.revision}-${definitionId}`, definitionId, upgradeLevel: 0 };
  }

  private calculateResult(outcome: 'victory' | 'defeat', defeatedById?: string): RunState['result'] {
    const run = this.requireRun();
    const rules = this.content.pack.ruleSet.scoring;
    const score = Math.max(0, Math.round(
      run.metrics.nodesVisited * rules.node + run.metrics.battlesWon * rules.battle +
      run.metrics.bossesDefeated * rules.boss + run.metrics.floorsCleared * rules.floor +
      run.player.health * rules.remainingHealth + (outcome === 'victory' ? rules.victory : 0),
    ));
    return { outcome, completedNodes: run.metrics.nodesVisited, score, metaTokens: Math.floor(score / rules.metaTokenDivisor), defeatedById };
  }

  private requireRun(): RunState {
    if (!this.state.run) throw new Error('There is no active run.');
    return this.state.run;
  }

  private requirePhase<T extends RunState['phase']>(phase: T): RunState & { phase: T } {
    const run = this.requireRun();
    if (this.state.phase !== phase || run.phase !== phase) throw new Error(`Expected phase ${phase}, received ${this.state.phase}.`);
    return run as RunState & { phase: T };
  }

  private emit(type: string, payload: Record<string, unknown>): void {
    this.pendingEvents.push({ type, payload, revision: this.state.revision + 1 });
  }
}
