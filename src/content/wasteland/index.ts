import rules from './data/rules.json';
import characters from './data/characters.json';
import cards from './data/cards.json';
import enemies from './data/enemies.json';
import encounters from './data/encounters.json';
import nodes from './data/nodes.json';
import events from './data/events.json';
import statuses from './data/statuses.json';
import relics from './data/relics.json';
import collectibles from './data/collectibles.json';
import rewards from './data/rewards.json';
import assets from './data/assets.json';
import localization from './data/localization.json';
import type { ContentPack } from '../../game/types';

export const wastelandContentPack = {
  id: 'wasteland-first-run',
  version: '2.0.0',
  locale: 'zh-CN',
  ruleSet: rules,
  characters,
  cards,
  enemies,
  encounters,
  nodes,
  events,
  statuses,
  relics,
  collectibles,
  rewards,
  assets,
  localization,
} as ContentPack;
