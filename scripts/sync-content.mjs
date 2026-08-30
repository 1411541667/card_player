import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const dataDir = resolve(root, 'src/content/wasteland/data');
const tableDir = resolve(root, 'src/content/wasteland/tables');
const checkOnly = process.argv.includes('--check');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...values] = rows;
  return values.map((columns) => Object.fromEntries(headers.map((header, index) => [header, columns[index] ?? ''])));
}

async function json(name) {
  return JSON.parse(await readFile(resolve(dataDir, name), 'utf8'));
}

async function csv(name) {
  return parseCsv(await readFile(resolve(tableDir, name), 'utf8'));
}

function numberIn(value, label) {
  const match = String(value).match(/\d+(?:\.\d+)?/);
  if (!match) throw new Error(`CSV field has no number (${label}): ${value}`);
  return Number(match[0]);
}

function requireRow(rows, id, category) {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`CSV is missing ${category}: ${id}`);
  return row;
}

function setEffectAmounts(effects, values) {
  let cursor = 0;
  for (const effect of effects) {
    if (typeof effect.params?.amount === 'number' && values[cursor] !== undefined) effect.params.amount = values[cursor++];
  }
}

const rules = await json('rules.json');
const cards = await json('cards.json');
const characters = await json('characters.json');
const enemies = await json('enemies.json');
const collectibles = await json('collectibles.json');
const events = await json('events.json');
const rewards = await json('rewards.json');
const localization = await json('localization.json');

const cardRows = await csv('cards.csv');
for (const card of cards) {
  const row = requireRow(cardRows, card.id, 'card');
  localization[card.nameKey] = row['名称'];
  card.cost.amount = numberIn(row['消耗'], `${card.id}.消耗`);
  const baseValue = numberIn(row['基础效果'], `${card.id}.基础效果`);
  if (card.type === 'ability') card.effects[0].params.stacks = baseValue;
  else setEffectAmounts(card.effects, [baseValue]);
  for (const [index, upgrade] of (card.upgrades ?? []).entries()) {
    const text = row[index === 0 ? '第一次强化' : '第二次强化'];
    const value = numberIn(text, `${card.id}.强化${index + 1}`);
    if (text.includes('消耗') && upgrade.cost) upgrade.cost.amount = value;
    else setEffectAmounts(upgrade.effects ?? [], [value]);
  }
}

const characterRows = await csv('characters.csv');
for (const character of characters) {
  const row = requireRow(characterRows, character.id, 'character');
  localization[character.nameKey] = row['名称'];
  character.maxHealth = numberIn(row['最大生命'], `${character.id}.最大生命`);
  if (character.id === rules.startingCharacterId) {
    rules.startingHealth = character.maxHealth;
    rules.startingGold = numberIn(row['初始商店代币'], `${character.id}.初始商店代币`);
  }
}

const enemyRows = [...await csv('enemies.csv'), ...await csv('bosses.csv')];
for (const enemy of enemies) {
  const row = requireRow(enemyRows, enemy.id, 'enemy');
  localization[enemy.nameKey] = row['名称'];
  enemy.maxHealth = numberIn(row['生命'], `${enemy.id}.生命`);
  const intentValues = [...row['攻击流程'].matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  setEffectAmounts(enemy.intents.flatMap((intent) => intent.effects), intentValues);
}

const collectibleRows = await csv('collectibles.csv');
for (const collectible of collectibles) {
  const row = requireRow(collectibleRows, collectible.id, 'collectible');
  localization[collectible.nameKey] = row['名称'];
}

const eventRows = await csv('events.csv');
for (const event of events) {
  if (!eventRows.some((row) => row.id === event.id)) throw new Error(`CSV is missing event: ${event.id}`);
}

const rewardRows = await csv('rewards.csv');
for (const reward of rewards) {
  const row = requireRow(rewardRows, reward.id, 'reward');
  localization[reward.nameKey] = row['名称'];
  if (reward.type === 'currency') reward.amount = numberIn(row['效果'], `${reward.id}.效果`);
  if (reward.type === 'healing') reward.amount = numberIn(row['效果'], `${reward.id}.效果`) / 100;
}

const outputs = { 'rules.json': rules, 'cards.json': cards, 'characters.json': characters, 'enemies.json': enemies, 'rewards.json': rewards, 'localization.json': localization };
let drift = false;
for (const [name, value] of Object.entries(outputs)) {
  const path = resolve(dataDir, name);
  if (checkOnly) {
    const current = JSON.parse(await readFile(path, 'utf8'));
    if (JSON.stringify(current) !== JSON.stringify(value)) { drift = true; process.stderr.write(`CSV/JSON drift: ${name}\n`); }
  } else {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
}
if (drift) process.exitCode = 1;
else process.stdout.write(`${checkOnly ? 'CSV and runtime JSON are synchronized.' : 'Runtime JSON generated from CSV tables.'}\n`);
