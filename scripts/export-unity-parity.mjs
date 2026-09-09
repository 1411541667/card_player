// Generate reference fixtures by running the real web kernel; never calculate expected maps in C#.
import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';

const root = resolve(import.meta.dirname, '..');
for (const name of ['rules', 'nodes', 'cards', 'characters', 'enemies', 'encounters', 'statuses', 'collectibles', 'rewards']) {
  const web = JSON.parse(await readFile(resolve(root, `src/content/wasteland/data/${name}.json`), 'utf8'));
  const native = JSON.parse(await readFile(resolve(root, `unity/Assets/StreamingAssets/wasteland/data/${name}.json`), 'utf8'));
  if (JSON.stringify(web) !== JSON.stringify(native)) throw new Error(`Content drift: ${name}.json`);
}
const bundle = await build({
  stdin: { resolveDir: root, loader: 'ts', contents: `
    import { GameKernel } from './src/game/kernel';
    import { ContentRegistry } from './src/game/content';
    import { createCoreEffectRegistry } from './src/game/effects';
    import { createCoreNodeHandlers } from './src/game/nodes';
    import { wastelandContentPack } from './src/content/wasteland';
    export const pack = wastelandContentPack;
    export function create() {
      const effects = createCoreEffectRegistry();
      return new GameKernel(new ContentRegistry(structuredClone(wastelandContentPack), effects), effects, createCoreNodeHandlers());
    }` },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { create, pack } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const maps = [];
for (const seed of ['seed', '废土🌵', 'map-parity-17', 'map-parity-42']) {
  for (let floor = 1; floor <= 4; floor++) {
    const game = create();
    game.dispatch({ type: 'NEW_RUN', seed });
    game.dispatch({ type: 'SELECT_CHARACTER', characterId: 'character.scavenger' });
    game.dispatch({ type: 'DEBUG_JUMP_FLOOR', floor });
    const save = game.exportSave();
    maps.push({ seed, floor, map: save.game.run.map,
      counters: Object.entries(save.random.counters).filter(([name]) => name.startsWith('map:')).map(([name, value]) => ({ name, value })) });
  }
}
const setups = [];
for (const characterId of ['character.scavenger', 'character.hunter']) {
  for (const boonId of ['boon.max-card', 'boon.max-health', 'boon.gold-shop', 'boon.resource', 'boon.greedy-coin', 'boon.remove-three']) {
    for (let i = 0; i < 1000; i++) {
      const seed = `setup-parity-${i}`; const game = create();
      game.dispatch({ type: 'NEW_RUN', seed }); game.dispatch({ type: 'SELECT_CHARACTER', characterId });
      const offers = game.getSnapshot().run.setup.boonOffers;
      if (!offers.includes(boonId)) continue;
      game.dispatch({ type: 'SELECT_BOON', boonId });
      while (game.getSnapshot().phase === 'boon-remove') game.dispatch({ type: 'REMOVE_STARTING_CARD', cardInstanceId: game.getSnapshot().run.deck.cards[0].instanceId });
      const { player, deck, setup } = game.getSnapshot().run;
      setups.push({ seed, characterId, boonId, offers, health: player.health, maxHealth: player.maxHealth, gold: player.gold,
        perTurnResource: player.resourcePerTurn[characterId === 'character.hunter' ? 'serum' : 'action'],
        cards: deck.cards, collectibles: player.collectibleIds, setup });
      break;
    }
  }
}
const directory = resolve(root, 'unity/Assets/Tests/EditMode/Fixtures');
await mkdir(directory, { recursive: true });
const json = JSON.stringify({ maps, setups }, null, 2) + '\n';
const destination = resolve(directory, 'web-route-parity.json');
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== json) throw new Error('Web parity fixture is stale. Run node scripts/export-unity-parity.mjs.');
} else await writeFile(destination, json);
console.log(`Web reference: ${maps.length} maps, ${setups.length} setup cases${process.argv.includes('--check') ? ' verified' : ' exported'}.`);

const statusView = (s) => ({ definitionId: s.definitionId, scope: s.scope, stacks: s.stacks, duration: s.duration ?? 0, hasDuration: s.duration !== undefined });
const randomView = (random) => ({ seed: random.seed, counters: Object.entries(random.counters).map(([name, value]) => ({ name, value })) });
function battleView(save, characterId) {
  const run = save.game.run; const battle = run.combat; const player = battle?.player ?? run.player;
  const resourceId = pack.characters.find(c => c.id === characterId).resourceId;
  return {
    active: !!battle, phase: save.game.phase[0].toUpperCase() + save.game.phase.slice(1),
    health: player.health, gold: player.gold, block: player.block, resource: player.resources[resourceId],
    revision: save.game.revision, battlesStarted: run.metrics.battlesStarted, battlesWon: run.metrics.battlesWon, damageTaken: run.metrics.damageTaken,
    hand: battle?.hand.map(c => c.instanceId) ?? [], drawPile: battle?.drawPile.map(c => c.instanceId) ?? [], discard: battle?.discardPile.map(c => c.instanceId) ?? [],
    statuses: player.statuses.map(statusView),
    rewardIds: run.reward?.offers.map(o => o.rewardDefinitionId) ?? [], rewardContinuation: run.reward?.continuation ?? '',
    counters: randomView(save.random).counters.filter(c => /^(combat:|encounter:|node:|collectible:|reward:)/.test(c.name)),
    combat: battle ? { encounterId: battle.encounterId, turn: battle.turn, cardsDrawn: battle.cardsDrawn, angerAttacksUsed: battle.angerAttacksUsed ?? 0, concealAttacksUsed: battle.concealAttacksUsed ?? 0,
      enemies: battle.enemies.map(e => ({ ...e, statuses: e.statuses.map(statusView) })), resources: Object.entries(player.resources).map(([id, amount]) => ({ id, amount })),
      statuses: player.statuses.map(statusView), exhaust: battle.exhaustPile.map(c => c.instanceId) } : null,
  };
}
const battles = [];
for (const scenario of [
  { name: 'scavenger-normal', floor: 1, handler: 'core.combat', characterId: 'character.scavenger' },
  { name: 'hunter-squad', floor: 2, handler: 'core.combat', characterId: 'character.hunter' },
  { name: 'guards-upgraded', floor: 3, handler: 'core.combat', characterId: 'character.scavenger', upgraded: true },
  { name: 'elite', floor: 1, handler: 'core.elite', characterId: 'character.hunter' },
  ...[1, 2, 3, 4].map(floor => ({ name: `boss-${floor}`, floor, handler: 'core.boss', characterId: 'character.scavenger' })),
  { name: 'defeat', floor: 2, handler: 'core.combat', characterId: 'character.hunter', defeat: true },
]) {
  const game = create(); game.dispatch({ type: 'NEW_RUN', seed: scenario.name }); game.dispatch({ type: 'SELECT_CHARACTER', characterId: scenario.characterId });
  game.dispatch({ type: 'DEBUG_JUMP_FLOOR', floor: scenario.floor });
  const save = game.exportSave(); const run = save.game.run;
  const node = run.map.nodes.find(n => n.handlerId === scenario.handler);
  run.map.nodes.forEach(n => { n.available = n.id === node.id; });
  // Authored test setup: all card effects and collectible triggers, with enough health to exercise intent cycles.
  run.player.maxHealth = 300; run.player.health = scenario.defeat ? 1 : 180;
  run.player.collectibleIds = pack.collectibles.filter(c => c.kind === 'positive').map(c => c.id);
  run.deck.cards = pack.cards.map((c, i) => ({ instanceId: `fixture-${i}-${c.id}`, definitionId: c.id, upgradeLevel: scenario.upgraded ? c.upgrades?.length ?? 0 : 0 }));
  game.restoreSave(save);
  const initial = {
    schemaVersion: 4, phase: 'Map', characterId: scenario.characterId, health: run.player.health, maxHealth: run.player.maxHealth, gold: run.player.gold, floor: run.floor, node: run.metrics.nodesVisited,
    deck: run.deck.cards.map(c => c.instanceId), cardInstances: run.deck.cards, collectibles: run.player.collectibleIds, map: run.map, setup: run.setup,
    perTurnResource: run.player.resourcePerTurn[pack.characters.find(c => c.id === scenario.characterId).resourceId],
    random: randomView(save.random), revision: save.game.revision,
  };
  const steps = [];
  game.dispatch({ type: 'ENTER_NODE', nodeId: node.id });
  steps.push({ kind: 'enter', nodeId: node.id, expected: battleView(game.exportSave(), scenario.characterId) });
  for (let turn = 0; game.getSnapshot().phase === 'combat' && turn < 100; turn++) {
    for (let action = 0; !scenario.defeat && game.getSnapshot().phase === 'combat' && action < 40; action++) {
      const battle = game.getSnapshot().run.combat;
      const candidates = [...battle.hand].sort((a, b) => Number(['card.anger', 'card.conceal'].includes(b.definitionId)) - Number(['card.anger', 'card.conceal'].includes(a.definitionId)));
      let played = false;
      for (const card of candidates) {
        const index = battle.hand.findIndex(c => c.instanceId === card.instanceId); const targetId = battle.enemies.find(e => e.health > 0).instanceId;
        try { game.dispatch({ type: 'PLAY_CARD', cardInstanceId: card.instanceId, targetId }); }
        catch { continue; }
        steps.push({ kind: 'play', index, targetId, expected: battleView(game.exportSave(), scenario.characterId) }); played = true; break;
      }
      if (!played) break;
    }
    if (game.getSnapshot().phase === 'combat') { game.dispatch({ type: 'END_TURN' }); steps.push({ kind: 'end', expected: battleView(game.exportSave(), scenario.characterId) }); }
  }
  if (game.getSnapshot().phase === 'combat') throw new Error(`Battle fixture did not finish: ${scenario.name}`);
  battles.push({ name: scenario.name, initial, steps });
}
const battleJson = JSON.stringify({ battles }, null, 2) + '\n';
const battlePath = resolve(directory, 'web-combat-parity.json');
if (process.argv.includes('--check')) {
  if (await readFile(battlePath, 'utf8') !== battleJson) throw new Error('Combat fixture is stale. Run node scripts/export-unity-parity.mjs.');
} else await writeFile(battlePath, battleJson);
console.log(`Web combat reference: ${battles.length} battles, ${battles.reduce((n, b) => n + b.steps.length, 0)} command snapshots.`);

const rewards = [];
for (const [rewardId, continuation, alreadyOwned] of [
  ['reward.scrap-150', 'map', false], ['reward.heal-30', 'map', false], ['reward.card-anger', 'next-floor', false],
  ['reward.gauze', 'map', false], ['reward.can', 'map', false], ['reward.can', 'map', true],
]) {
  const game = create(); game.dispatch({ type: 'NEW_RUN', seed: 'reward-parity' }); game.dispatch({ type: 'SELECT_CHARACTER', characterId: 'character.scavenger' });
  game.dispatch({ type: 'DEBUG_JUMP_FLOOR', floor: 1 });
  const save = game.exportSave(); const run = save.game.run;
  save.game.phase = run.phase = 'reward'; run.player.health = 31;
  if (alreadyOwned) run.player.collectibleIds.push('collectible.can');
  run.reward = { offers: [{ id: 'reward-0', rewardDefinitionId: rewardId }], source: continuation === 'map' ? 'node' : 'boss', continuation, canSkip: false };
  game.restoreSave(save);
  const initial = { schemaVersion: 4, phase: 'Reward', characterId: 'character.scavenger', health: run.player.health, maxHealth: run.player.maxHealth, gold: run.player.gold, floor: 1,
    deck: run.deck.cards.map(c => c.instanceId), cardInstances: run.deck.cards, collectibles: run.player.collectibleIds, map: run.map, perTurnResource: 3,
    rewardIds: [rewardId], rewardContinuation: continuation, random: randomView(save.random), revision: save.game.revision };
  game.dispatch({ type: 'CHOOSE_REWARD', rewardOfferId: 'reward-0' });
  const result = game.exportSave(); const final = result.game.run;
  rewards.push({ name: rewardId + (alreadyOwned ? '-owned' : ''), initial,
    health: final.player.health, gold: final.player.gold, floor: final.floor, revision: result.game.revision, cards: final.deck.cards,
    collectibles: final.player.collectibleIds, map: final.map, random: randomView(result.random) });
}
const rewardJson = JSON.stringify({ rewards }, null, 2) + '\n';
const rewardPath = resolve(directory, 'web-reward-parity.json');
if (process.argv.includes('--check')) {
  if (await readFile(rewardPath, 'utf8') !== rewardJson) throw new Error('Reward fixture is stale. Run node scripts/export-unity-parity.mjs.');
} else await writeFile(rewardPath, rewardJson);
console.log(`Web reward reference: ${rewards.length} reward/continuation cases.`);
