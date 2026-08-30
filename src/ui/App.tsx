import { useEffect, useMemo, useState } from 'preact/hooks';
import { cardCost, cardDescriptionKey, maxUpgradeLevel } from '../game/cards';
import type { ContentRegistry } from '../game/content';
import type { GameKernel } from '../game/kernel';
import { commandForKey } from '../game/input/bindings';
import { createInitialMetaProgress, type MetaProgressStore } from '../game/meta';
import type { BrowserSaveStore } from '../game/save';
import type { GameSettings, SettingsStore } from '../game/settings';
import type { CardDefinition, CardInstance, GameCommand, GameSnapshot, MetaProgressV2, RunSaveV2 } from '../game/types';

interface AppProps {
  kernel: GameKernel;
  content: ContentRegistry;
  saveStore: BrowserSaveStore;
  metaStore: MetaProgressStore;
  settingsStore: SettingsStore;
  initialSave?: RunSaveV2;
  startupWarning?: string;
  setGameVolume?: (volume: number) => void;
}

type MenuView = 'main' | 'settings' | 'encyclopedia' | 'stats';
type InfoView = 'deck' | 'collectibles';

const nodeLabels: Record<string, string> = {
  'core.combat': '战斗节点', 'core.elite': '精英节点', 'core.boss': '首领节点',
  'core.shop': '商店节点', 'core.event': '事件节点', 'core.reward': '物资节点',
};

const phaseLabels: Record<string, string> = {
  map: '地图', combat: '战斗', reward: '奖励', shop: '商店', event: '事件', result: '结算',
};

const mapIconUrls: Record<string, string> = {
  'core.combat': new URL('../content/wasteland/assets/icon_map/combat.svg', import.meta.url).href,
  'core.elite': new URL('../content/wasteland/assets/icon_map/elite.svg', import.meta.url).href,
  'core.shop': new URL('../content/wasteland/assets/icon_map/shop.svg', import.meta.url).href,
  'core.event': new URL('../content/wasteland/assets/icon_map/event.svg', import.meta.url).href,
  'core.reward': new URL('../content/wasteland/assets/icon_map/reward.svg', import.meta.url).href,
  'core.boss': new URL('../content/wasteland/assets/icon_map/boss.svg', import.meta.url).href,
};

const cardIconUrls: Record<CardDefinition['type'], string> = {
  attack: new URL('../content/wasteland/assets/icon_card/attack.svg', import.meta.url).href,
  defense: new URL('../content/wasteland/assets/icon_card/defense.svg', import.meta.url).href,
  skill: new URL('../content/wasteland/assets/icon_card/skill.svg', import.meta.url).href,
  ability: new URL('../content/wasteland/assets/icon_card/ability.svg', import.meta.url).href,
};

const battleIconUrls: Record<string, string> = {
  'status.anger': new URL('../content/wasteland/assets/icon_battle/anger.svg', import.meta.url).href,
  'status.strong': new URL('../content/wasteland/assets/icon_battle/strong.svg', import.meta.url).href,
  'status.sharp': new URL('../content/wasteland/assets/icon_battle/sharp.svg', import.meta.url).href,
  'status.clear': new URL('../content/wasteland/assets/icon_battle/clear.svg', import.meta.url).href,
  'status.weak': new URL('../content/wasteland/assets/icon_battle/weak.svg', import.meta.url).href,
};

const boonCopy: Record<string, { name: string; description: string }> = {
  'boon.max-card': { name: '炉火淬炼', description: '随机将初始牌组中的一张牌强化至最高等级。' },
  'boon.max-health': { name: '顽强血肉', description: '最大生命增加30%，并恢复至新的生命上限。' },
  'boon.gold-shop': { name: '意外横财', description: '获得100代币，并立即进入一次开局商店。' },
  'boon.resource': { name: '备用电池', description: '每回合行动力由3提高至4。' },
  'boon.greedy-coin': { name: '贪婪的金币', description: '获得局内收集品“贪婪的金币”。' },
  'boon.remove-three': { name: '轻装上路', description: '自行从初始牌组中删除3张牌。' },
};

export function App({ kernel, content, saveStore, metaStore, settingsStore, initialSave, startupWarning, setGameVolume }: AppProps) {
  const [snapshot, setSnapshot] = useState<GameSnapshot>(kernel.getSnapshot());
  const [error, setError] = useState(startupWarning ?? '');
  const [debugOpen, setDebugOpen] = useState(false);
  const [hasSave, setHasSave] = useState(Boolean(initialSave));
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [infoView, setInfoView] = useState<InfoView>();
  const [settings, setSettings] = useState<GameSettings>(() => settingsStore.load());
  const [meta, setMeta] = useState<MetaProgressV2>(() => metaStore.load(createInitialMetaProgress(content.pack)));

  const dispatch = (command: GameCommand) => {
    try {
      setError('');
      kernel.dispatch(command);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  useEffect(() => kernel.subscribe((next, events) => {
    setSnapshot(next);
    setMeta((current) => {
      let updated = discoverContent(current, next, content);
      if (events.some((event) => event.type === 'run.completed') && next.run) updated = metaStore.recordRun(updated, next.run);
      if (JSON.stringify(updated) !== JSON.stringify(current)) metaStore.save(updated);
      return updated;
    });
  }), [kernel, content, metaStore]);

  useEffect(() => {
    if (!snapshot.run) return;
    try {
      saveStore.save(kernel.exportSave());
      setHasSave(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [snapshot.revision, snapshot.run, kernel, saveStore]);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
    settingsStore.save(settings);
    setGameVolume?.(settings.volume);
  }, [settings, settingsStore, setGameVolume]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const command = commandForKey(event, snapshot, settings.bindings);
      if (command) { event.preventDefault(); dispatch(command); }
      if (event.key === '`') setDebugOpen((value) => !value);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [snapshot, settings.bindings]);

  useEffect(() => {
    if (snapshot.phase === 'menu') setMenuView('main');
  }, [snapshot.phase]);

  const run = snapshot.run;
  const showHud = run && ['map', 'combat', 'reward', 'shop', 'event', 'result'].includes(snapshot.phase);

  return (
    <main class="ui-shell">
      {showHud && (
        <header class="topbar">
          <div class="stat"><span>阶段</span><strong>{phaseLabels[snapshot.phase] ?? snapshot.phase}</strong></div>
          <div class="stat"><span>区域</span><strong>{run.floor}/{run.totalFloors}</strong></div>
          <div class="stat"><span>生命</span><strong>{run.combat?.player.health ?? run.player.health}/{run.player.maxHealth}</strong></div>
          <div class="stat"><span>防护</span><strong>{run.combat?.player.block ?? 0}</strong></div>
          <div class="stat"><span>代币</span><strong>{run.combat?.player.gold ?? run.player.gold}</strong></div>
          <div class="topbar-spacer" />
          <button class="ghost" onClick={() => setInfoView('deck')}>卡包</button>
          <button class="ghost" onClick={() => setInfoView('collectibles')}>收集品</button>
          <button class="ghost" onClick={() => setDebugOpen((value) => !value)}>开发面板</button>
        </header>
      )}

      {error && <div class="error-banner" role="alert">{error}<button onClick={() => setError('')}>关闭</button></div>}

      {snapshot.phase === 'menu' && menuView === 'main' && (
        <section class="center-panel menu-panel" data-testid="menu">
          <p class="eyebrow">WASTELAND // 尘沙</p>
          <h1>异变独行</h1>
          <div class="menu-actions">
            <button class="primary" data-testid="new-run" onClick={() => dispatch({ type: 'NEW_RUN' })}>开始游戏</button>
            {hasSave && <button onClick={() => { try { const save = saveStore.load(); if (save) kernel.restoreSave(save); } catch (cause) { setError(String(cause)); } }}>继续游戏</button>}
            <button onClick={() => setMenuView('settings')}>设置</button>
            <button onClick={() => setMenuView('encyclopedia')}>百科</button>
            <button onClick={() => setMenuView('stats')}>统计</button>
          </div>
          <small class="menu-meta">局外养成代币：{meta.tokens}</small>
        </section>
      )}

      {snapshot.phase === 'menu' && menuView === 'settings' && <SettingsPanel settings={settings} setSettings={setSettings} back={() => setMenuView('main')} setError={setError} />}
      {snapshot.phase === 'menu' && menuView === 'encyclopedia' && <EncyclopediaPanel content={content} meta={meta} back={() => setMenuView('main')} />}
      {snapshot.phase === 'menu' && menuView === 'stats' && <StatsPanel content={content} meta={meta} back={() => setMenuView('main')} />}

      {snapshot.phase === 'character-select' && <CharacterSelect content={content} dispatch={dispatch} />}
      {snapshot.phase === 'boon-select' && run?.setup && <BoonSelect boonIds={run.setup.boonOffers} dispatch={dispatch} />}
      {snapshot.phase === 'boon-remove' && run?.setup && <StartingCardRemoval run={run} content={content} dispatch={dispatch} />}
      {snapshot.phase === 'theme-select' && <ThemeSelect dispatch={dispatch} />}
      {snapshot.phase === 'map' && run && <MapPanel snapshot={snapshot} dispatch={dispatch} />}
      {snapshot.phase === 'combat' && run?.combat && <CombatPanel snapshot={snapshot} content={content} bindings={settings.bindings.hand} endTurnKey={settings.bindings.endTurn} dispatch={dispatch} />}
      {snapshot.phase === 'reward' && run?.reward && <RewardPanel snapshot={snapshot} content={content} dispatch={dispatch} />}
      {snapshot.phase === 'shop' && run?.shop && <ShopPanel snapshot={snapshot} content={content} dispatch={dispatch} />}
      {snapshot.phase === 'event' && run?.event && <EventPanel snapshot={snapshot} content={content} dispatch={dispatch} />}
      {snapshot.phase === 'result' && run?.result && (
        <section class="center-panel result-panel" data-testid="result">
          <p class="eyebrow">RUN COMPLETE</p>
          <h2>{run.result.outcome === 'victory' ? '你穿过了风沙' : '拾荒者倒下了'}</h2>
          <p>到达层数：{run.floor}/{run.totalFloors}</p>
          <p>完成战斗：{run.metrics.battlesStarted}</p>
          <p>已处理节点：{run.result.completedNodes}</p>
          <p>结局分数：<strong>{run.result.score}</strong></p>
          <p>获得局外养成代币：<strong>{run.result.metaTokens}</strong></p>
          <div class="button-row"><button class="primary" onClick={() => dispatch({ type: 'NEW_RUN' })}>开始新游戏</button><button onClick={() => dispatch({ type: 'RETURN_TO_MENU' })}>返回主菜单</button></div>
        </section>
      )}

      {infoView && run && <RunInfoPanel view={infoView} snapshot={snapshot} content={content} close={() => setInfoView(undefined)} />}

      {debugOpen && run && <DebugPanel kernel={kernel} snapshot={snapshot} content={content} saveStore={saveStore} dispatch={dispatch} close={() => setDebugOpen(false)} />}
    </main>
  );
}

function CharacterSelect({ content, dispatch }: { content: ContentRegistry; dispatch: (command: GameCommand) => void }) {
  const scavenger = content.characters.get(content.pack.ruleSet.startingCharacterId)!;
  return <section class="center-panel wide setup-panel" data-testid="character-select"><p class="eyebrow">STEP 01 // 选择角色</p><h2>谁走进风沙？</h2><div class="selection-grid">
    <button class="selection-card available" onClick={() => dispatch({ type: 'SELECT_CHARACTER', characterId: scavenger.id })}><span>可用角色</span><strong>{content.text(scavenger.nameKey)}</strong><p>{content.text(scavenger.descriptionKey)}</p><small>生命 80 · 行动力 3 · 初始布袋</small></button>
    <button class="selection-card" disabled><span>开发中</span><strong>未解锁角色</strong><p>风沙遮住了这个人的名字。</p></button>
    <button class="selection-card" disabled><span>开发中</span><strong>未解锁角色</strong><p>尚未有人从这条路线回来。</p></button>
  </div></section>;
}

function BoonSelect({ boonIds, dispatch }: { boonIds: string[]; dispatch: (command: GameCommand) => void }) {
  return <section class="center-panel wide setup-panel" data-testid="boon-select"><p class="eyebrow">STEP 02 // 开局增益</p><h2>只带走一项</h2><div class="selection-grid">{boonIds.map((id) => <button class="selection-card available" onClick={() => dispatch({ type: 'SELECT_BOON', boonId: id })}><span>随机候选</span><strong>{boonCopy[id]?.name ?? id}</strong><p>{boonCopy[id]?.description}</p></button>)}</div></section>;
}

function StartingCardRemoval({ run, content, dispatch }: { run: NonNullable<GameSnapshot['run']>; content: ContentRegistry; dispatch: (command: GameCommand) => void }) {
  return <section class="center-panel wide setup-panel" data-testid="boon-remove"><p class="eyebrow">轻装上路 // 还需删除 {run.setup!.pendingCardRemovals} 张</p><h2>选择要舍弃的卡牌</h2><div class="compact-card-grid">{run.deck.cards.map((card) => { const definition = content.cards.get(card.definitionId)!; return <button onClick={() => dispatch({ type: 'REMOVE_STARTING_CARD', cardInstanceId: card.instanceId })}><strong>{content.text(definition.nameKey)}</strong><small>{card.upgradeLevel ? `强化 +${card.upgradeLevel}` : '基础'}</small></button>; })}</div></section>;
}

function ThemeSelect({ dispatch }: { dispatch: (command: GameCommand) => void }) {
  return <section class="center-panel wide setup-panel" data-testid="theme-select"><p class="eyebrow">STEP 03 // 地图主题</p><h2>选择前进方向</h2><div class="selection-grid">
    <button class="selection-card available" onClick={() => dispatch({ type: 'SELECT_THEME', themeId: 'theme.dust' })}><span>当前开放</span><strong>尘沙</strong><p>风化废墟、锈蚀道路与被掩埋的真相。</p></button>
    <button class="selection-card" disabled><span>未开放</span><strong>暗林</strong></button>
    <button class="selection-card" disabled><span>未开放</span><strong>寂原</strong></button>
  </div></section>;
}

function MapPanel({ snapshot, dispatch }: { snapshot: GameSnapshot; dispatch: (command: GameCommand) => void }) {
  const run = snapshot.run!;
  const available = run.map.nodes.filter((node) => node.available && !node.visited);
  return <aside class="map-actions" data-testid="map-panel"><p class="eyebrow">FLOOR {run.floor} / {run.totalFloors} · 选择相邻节点</p><div class="map-action-row">{available.map((node) => <button class={`map-node-button ${node.handlerId.replace('core.', '')}`} data-testid={`node-${node.handlerId}`} title={nodeLabels[node.handlerId] ?? node.handlerId} onClick={() => dispatch({ type: 'ENTER_NODE', nodeId: node.id })}><img src={mapIconUrls[node.handlerId]} alt="" /><span>{nodeLabels[node.handlerId] ?? node.handlerId}</span></button>)}</div></aside>;
}

function RunInfoPanel({ view, snapshot, content, close }: { view: InfoView; snapshot: GameSnapshot; content: ContentRegistry; close: () => void }) {
  const run = snapshot.run!;
  return <section class="center-panel wide run-info-panel" data-testid={`run-${view}`}><div class="debug-heading"><div><p class="eyebrow">RUN INFORMATION</p><h2>{view === 'deck' ? `卡包 · ${run.deck.cards.length} 张` : `收集品 · ${run.player.collectibleIds.length} 件`}</h2></div><button onClick={close}>关闭</button></div>{view === 'deck' ? <div class="archive-grid">{run.deck.cards.map((card) => { const definition = content.cards.get(card.definitionId)!; return <article class={`rarity-${definition.rarity ?? 'gray'}`}><img class="info-icon" src={cardIconUrls[definition.type]} alt="" /><strong>{content.text(definition.nameKey)}{card.upgradeLevel ? ` +${card.upgradeLevel}` : ''}</strong><p>{content.text(cardDescriptionKey(definition, card))}</p></article>; })}</div> : <div class="archive-grid">{run.player.collectibleIds.map((id) => { const collectible = content.collectibles.get(id)!; return <article class={`rarity-${collectible.rarity ?? 'blue'}`} title={content.text(collectible.descriptionKey)}><strong>{content.text(collectible.nameKey)}</strong><p>{content.text(collectible.descriptionKey)}</p></article>; })}</div>}</section>;
}

function CombatPanel({ snapshot, content, bindings, endTurnKey, dispatch }: { snapshot: GameSnapshot; content: ContentRegistry; bindings: string[]; endTurnKey: string; dispatch: (command: GameCommand) => void }) {
  const combat = snapshot.run!.combat!;
  const [selectedTarget, setSelectedTarget] = useState(combat.enemies.find((enemy) => enemy.health > 0)?.instanceId);
  useEffect(() => {
    if (!combat.enemies.some((enemy) => enemy.instanceId === selectedTarget && enemy.health > 0)) setSelectedTarget(combat.enemies.find((enemy) => enemy.health > 0)?.instanceId);
  }, [combat.enemies, selectedTarget]);
  const resource = Object.entries(combat.player.resources)[0];
  const clarity = combat.player.statuses.find((status) => status.definitionId === 'status.clear')?.stacks ?? 0;
  return <section class="combat-ui" data-testid="combat">
    <div class="enemy-selector">{combat.enemies.map((enemy) => { const definition = content.enemies.get(enemy.definitionId)!; const intent = definition.intents[enemy.intentIndex % definition.intents.length]; return <button class={selectedTarget === enemy.instanceId ? 'selected' : ''} disabled={enemy.health <= 0} onClick={() => setSelectedTarget(enemy.instanceId)}><strong>{content.text(definition.nameKey)}</strong><span>HP {enemy.health} · 防护 {enemy.block}</span><small>意图：{content.text(intent.nameKey)}</small></button>; })}</div>
    <div class="combat-controls"><span>回合 {combat.turn}</span>{resource && <span>行动力：{resource[1]}</span>}<button data-testid="end-turn" onClick={() => dispatch({ type: 'END_TURN' })}>结束回合 <kbd>{endTurnKey.toUpperCase()}</kbd></button></div>
    <div class="battle-statuses" aria-label="角色增益与减益">{combat.player.statuses.map((status) => { const definition = content.statuses.get(status.definitionId)!; return <span title={`${content.text(definition.descriptionKey)}${status.duration !== undefined ? ` · 剩余${status.duration}回合` : ''}`}><img src={battleIconUrls[status.definitionId]} alt="" /><b>{content.text(definition.nameKey)}</b><em>{status.stacks}</em></span>; })}</div>
    <div class="hand" aria-label="手牌">{combat.hand.map((card, index) => { const definition = content.cards.get(card.definitionId)!; const baseCost = cardCost(definition, card); const cost = { ...baseCost, amount: definition.type === 'skill' ? Math.max(0, baseCost.amount - clarity) : baseCost.amount }; const affordable = combat.player.resources[cost.resourceId] >= cost.amount; return <CardButton key={card.instanceId} card={card} definition={definition} content={content} shortcut={bindings[index]} costOverride={cost.amount} disabled={!affordable} onClick={() => dispatch({ type: 'PLAY_CARD', cardInstanceId: card.instanceId, targetId: selectedTarget })} />; })}</div>
  </section>;
}

function CardButton({ definition, card, content, shortcut, costOverride, disabled, onClick }: { definition: CardDefinition; card?: CardInstance; content: ContentRegistry; shortcut?: string; costOverride?: number; disabled?: boolean; onClick: () => void }) {
  const cost = card ? cardCost(definition, card) : definition.cost;
  const description = cardDescriptionKey(definition, card);
  return <button class={`card card-${definition.type} rarity-${definition.rarity ?? 'gray'} ${(card?.upgradeLevel ?? 0) > 0 ? 'upgraded' : ''}`} data-testid={`card-${definition.id}`} disabled={disabled} onClick={onClick}><span class="card-cost">{costOverride ?? cost.amount}</span>{shortcut !== undefined && <kbd>{shortcut.toUpperCase()}</kbd>}<img class="card-art" src={cardIconUrls[definition.type]} alt="" /><strong>{content.text(definition.nameKey)}{card?.upgradeLevel ? ` +${card.upgradeLevel}` : ''}</strong><p>{content.text(description)}</p><small>{definition.type} · {definition.playDestination}</small></button>;
}

function RewardPanel({ snapshot, content, dispatch }: { snapshot: GameSnapshot; content: ContentRegistry; dispatch: (command: GameCommand) => void }) {
  const rewardState = snapshot.run!.reward!;
  const title = rewardState.source === 'boss' ? '首领战利品：三选一' : '发现一份物资';
  return <section class="center-panel wide" data-testid="reward"><p class="eyebrow">SALVAGE // {rewardState.source}</p><h2>{title}</h2><div class="reward-grid">{rewardState.offers.map((offer) => { const reward = content.rewards.get(offer.rewardDefinitionId)!; return <button class="reward-offer" onClick={() => dispatch({ type: 'CHOOSE_REWARD', rewardOfferId: offer.id })}><small>{reward.type}</small><strong>{content.text(reward.nameKey)}</strong><p>{content.text(reward.descriptionKey)}</p></button>; })}</div>{rewardState.canSkip && <button onClick={() => dispatch({ type: 'CHOOSE_REWARD' })}>放弃奖励</button>}</section>;
}

function ShopPanel({ snapshot, content, dispatch }: { snapshot: GameSnapshot; content: ContentRegistry; dispatch: (command: GameCommand) => void }) {
  const run = snapshot.run!;
  const [selectedCardId, setSelectedCardId] = useState(run.deck.cards[0]?.instanceId ?? '');
  useEffect(() => {
    if (!run.deck.cards.some((card) => card.instanceId === selectedCardId)) setSelectedCardId(run.deck.cards[0]?.instanceId ?? '');
  }, [run.deck.cards, selectedCardId]);
  return <section class="center-panel wide shop-surface" data-testid="shop"><p class="eyebrow">TRADER // {run.player.gold} TOKENS</p><h2>{run.shop!.returnPhase === 'theme-select' ? '开局商店' : '废墟商店'}</h2><div class="shop-grid">{run.shop!.offers.map((offer) => {
    const card = offer.cardDefinitionId ? content.cards.get(offer.cardDefinitionId) : undefined;
    const collectible = offer.collectibleId ? content.collectibles.get(offer.collectibleId) : undefined;
    const title = card ? content.text(card.nameKey) : collectible ? content.text(collectible.nameKey) : offer.type === 'heal' ? '生命恢复 30%' : offer.type === 'remove' ? '删除卡牌' : '强化卡牌';
    const needsCard = offer.type === 'remove' || offer.type === 'upgrade';
    const price = offer.basePrice + offer.priceStep * offer.purchaseCount;
    const selected = run.deck.cards.find((instance) => instance.instanceId === selectedCardId);
    const unavailableSelection = offer.type === 'upgrade' && selected ? selected.upgradeLevel >= maxUpgradeLevel(content.cards.get(selected.definitionId)!) : false;
    const rarity = card?.rarity ?? collectible?.rarity ?? 'gray';
    return <article class={`shop-offer rarity-${rarity}`} title={collectible ? content.text(collectible.descriptionKey) : undefined}><small>{offer.type}{rarity ? ` · ${rarity}` : ''}{offer.purchaseCount > 0 ? ` · 已使用${offer.purchaseCount}次` : ''}</small><strong>{title}</strong>{card && <p>{content.text(card.descriptionKey)}</p>}{collectible && <p>{content.text(collectible.descriptionKey)}</p>}{needsCard && <select value={selectedCardId} onChange={(event) => setSelectedCardId(event.currentTarget.value)}>{run.deck.cards.map((instance) => <option value={instance.instanceId}>{content.text(content.cards.get(instance.definitionId)!.nameKey)}{instance.upgradeLevel ? ` +${instance.upgradeLevel}` : ''}</option>)}</select>}<button disabled={offer.soldOut || run.player.gold < price || unavailableSelection} onClick={() => dispatch({ type: 'BUY_SHOP_OFFER', offerId: offer.id, cardInstanceId: needsCard ? selectedCardId : undefined })}>{offer.soldOut ? '已售出' : `${price} 代币`}</button></article>;
  })}</div><button onClick={() => dispatch({ type: 'LEAVE_SHOP' })}>离开商店</button></section>;
}

function EventPanel({ snapshot, content, dispatch }: { snapshot: GameSnapshot; content: ContentRegistry; dispatch: (command: GameCommand) => void }) {
  const event = content.events.get(snapshot.run!.event!.definitionId)!;
  const player = snapshot.run!.player;
  const run = snapshot.run!;
  const [selectedCardId, setSelectedCardId] = useState(run.deck.cards[0]?.instanceId ?? '');
  return <section class="center-panel" data-testid="event"><p class="eyebrow">ENCOUNTER</p><h2>{content.text(event.titleKey)}</h2><p>{content.text(event.bodyKey)}</p>{event.options.some((option) => option.requiresCardChoice) && <label class="field">为需要选牌的选项指定卡牌<select value={selectedCardId} onChange={(input) => setSelectedCardId(input.currentTarget.value)}>{run.deck.cards.map((card) => <option value={card.instanceId}>{content.text(content.cards.get(card.definitionId)!.nameKey)}{card.upgradeLevel ? ` +${card.upgradeLevel}` : ''}</option>)}</select></label>}<div class="button-stack">{event.options.map((option) => { const needsLetter = option.recordsBloodLetterCondition && !player.collectibleIds.includes('collectible.blood-letter'); const goldCost = option.recordsBloodLetterCondition ? 0 : (option.goldCost ?? 0); return <button disabled={(option.healthCost ?? 0) >= player.health || goldCost > player.gold || needsLetter} title={needsLetter ? '需要沾染血迹的信' : undefined} onClick={() => dispatch({ type: 'CHOOSE_EVENT', optionId: option.id, cardInstanceId: option.requiresCardChoice ? selectedCardId : undefined })}>{content.text(option.labelKey)}</button>; })}</div></section>;
}

function SettingsPanel({ settings, setSettings, back, setError }: { settings: GameSettings; setSettings: (value: GameSettings | ((current: GameSettings) => GameSettings)) => void; back: () => void; setError: (message: string) => void }) {
  const bindHand = (index: number, key: string) => setSettings((current) => {
    const next = structuredClone(current);
    const normalized = key.toLowerCase();
    const old = next.bindings.hand[index];
    const duplicate = next.bindings.hand.findIndex((value, candidate) => candidate !== index && value.toLowerCase() === normalized);
    if (duplicate >= 0) next.bindings.hand[duplicate] = old;
    if (next.bindings.endTurn.toLowerCase() === normalized) next.bindings.endTurn = old;
    next.bindings.hand[index] = normalized;
    return next;
  });
  const bindEndTurn = (key: string) => setSettings((current) => {
    const next = structuredClone(current);
    const normalized = key.toLowerCase();
    const duplicate = next.bindings.hand.findIndex((value) => value.toLowerCase() === normalized);
    if (duplicate >= 0) next.bindings.hand[duplicate] = next.bindings.endTurn;
    next.bindings.endTurn = normalized;
    return next;
  });
  const keyCapture = (callback: (key: string) => void) => (event: KeyboardEvent) => {
    if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(event.key)) return;
    event.preventDefault(); callback(event.key);
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <section class="center-panel wide menu-surface" data-testid="settings"><p class="eyebrow">SETTINGS</p><h2>设置</h2><div class="settings-grid">
    <label>主音量 <strong>{Math.round(settings.volume * 100)}%</strong><input type="range" min="0" max="1" step="0.05" value={settings.volume} onInput={(event) => setSettings({ ...settings, volume: Number(event.currentTarget.value) })} /></label>
    <div class="setting-row"><span>屏幕</span><button onClick={toggleFullscreen}>{document.fullscreenElement ? '切换窗口化' : '切换全屏'}</button></div>
    <label class="toggle"><input type="checkbox" checked={settings.reducedMotion} onChange={(event) => setSettings({ ...settings, reducedMotion: event.currentTarget.checked })} /> 减弱非必要动画</label>
  </div><h3>快捷键</h3><div class="binding-grid">{settings.bindings.hand.map((key, index) => <label>手牌 {index + 1}<button onKeyDown={keyCapture((next) => bindHand(index, next))}>{key.toUpperCase()}</button></label>)}<label>结束回合<button onKeyDown={keyCapture(bindEndTurn)}>{settings.bindings.endTurn.toUpperCase()}</button></label></div><p class="hint">点击按键框后直接按下新按键；若重复，将自动交换绑定。</p><button onClick={back}>返回主菜单</button></section>;
}

function EncyclopediaPanel({ content, meta, back }: { content: ContentRegistry; meta: MetaProgressV2; back: () => void }) {
  const [tab, setTab] = useState<'characters' | 'cards' | 'enemies' | 'collectibles'>('characters');
  const definitions = tab === 'characters' ? content.pack.characters : tab === 'cards' ? content.pack.cards : tab === 'enemies' ? content.pack.enemies : content.pack.collectibles;
  const discovered = tab === 'characters' ? meta.discoveredCharacterIds : tab === 'cards' ? meta.discoveredCardIds : tab === 'enemies' ? meta.discoveredEnemyIds : meta.discoveredCollectibleIds;
  return <section class="center-panel wide menu-surface" data-testid="encyclopedia"><p class="eyebrow">ARCHIVE // 遇见后解锁</p><h2>百科</h2><div class="tab-row"><button onClick={() => setTab('characters')}>角色</button><button onClick={() => setTab('cards')}>卡牌</button><button onClick={() => setTab('enemies')}>敌人</button><button onClick={() => setTab('collectibles')}>收集品</button></div><div class="archive-grid">{definitions.map((definition) => { const unlocked = discovered.includes(definition.id); return <article class={unlocked ? '' : 'locked'}><small>{unlocked ? definition.id : '未遇见'}</small><strong>{unlocked ? content.text(definition.nameKey) : '？？？'}</strong><p>{unlocked ? definitionDescription(definition, content) : '继续深入尘沙以解锁记录。'}</p></article>; })}</div><button onClick={back}>返回主菜单</button></section>;
}

function StatsPanel({ content, meta, back }: { content: ContentRegistry; meta: MetaProgressV2; back: () => void }) {
  return <section class="center-panel wide menu-surface" data-testid="stats"><p class="eyebrow">LAST THREE RUNS</p><h2>最近三局</h2>{meta.runHistory.length === 0 ? <p>还没有完成的游戏记录。</p> : <div class="history-list">{meta.runHistory.map((entry) => <article><strong>{entry.outcome === 'victory' ? '通关' : '未通关'}</strong><span>到达第 {entry.floorReached} 层 · 战斗 {entry.battles} 次</span><span>{entry.outcome === 'defeat' ? `死于 ${entry.defeatedById ? content.text(content.enemies.get(entry.defeatedById)?.nameKey ?? entry.defeatedById) : '未知原因'}` : `最终分数 ${entry.score}`}</span><small>{new Date(entry.finishedAt).toLocaleString('zh-CN')}</small></article>)}</div>}<button onClick={back}>返回主菜单</button></section>;
}

function DebugPanel({ kernel, snapshot, content, saveStore, dispatch, close }: { kernel: GameKernel; snapshot: GameSnapshot; content: ContentRegistry; saveStore: BrowserSaveStore; dispatch: (command: GameCommand) => void; close: () => void }) {
  const [documentText, setDocumentText] = useState('');
  const resourceIds = Object.keys(content.pack.ruleSet.resources);
  const [resourceAmount, setResourceAmount] = useState('99');
  const eventLines = useMemo(() => kernel.getEventLog().slice(-12).reverse(), [kernel, snapshot.revision]);
  return <aside class="debug-panel" data-testid="debug-panel"><div class="debug-heading"><div><p class="eyebrow">DEVELOPER</p><h2>开发面板</h2></div><button onClick={close}>关闭</button></div>
    <details open><summary>状态快照</summary><pre>{JSON.stringify(snapshot, null, 2)}</pre></details>
    <details><summary>资源调试</summary>{resourceIds.map((resourceId) => <div class="inline-form"><code>{resourceId}</code><input type="number" value={resourceAmount} onInput={(event) => setResourceAmount(event.currentTarget.value)} /><button onClick={() => dispatch({ type: 'DEBUG_SET_RESOURCE', resourceId, amount: Number(resourceAmount) })}>设置</button></div>)}</details>
    <details><summary>跳转节点</summary><div class="debug-node-grid">{snapshot.run!.map.nodes.map((node) => <button onClick={() => dispatch({ type: 'DEBUG_JUMP_NODE', nodeId: node.id })}>{node.id}<small>{node.handlerId}</small></button>)}</div></details>
    <details><summary>启动事件</summary><div class="debug-node-grid">{content.pack.events.map((event) => <button onClick={() => dispatch({ type: 'DEBUG_START_EVENT', eventId: event.id })}>{content.text(event.titleKey)}<small>{event.id}</small></button>)}</div></details>
    <details><summary>存档导入导出</summary><textarea rows={8} value={documentText} onInput={(event) => setDocumentText(event.currentTarget.value)} /><div class="button-row"><button onClick={() => setDocumentText(saveStore.export(kernel.exportSave()))}>导出到文本框</button><button onClick={() => { const value = saveStore.import(documentText); kernel.restoreSave(value); }}>导入文本框</button><button onClick={() => saveStore.clear()}>清除本地存档</button></div></details>
    <details><summary>最近领域事件</summary><ol class="event-log">{eventLines.map((event) => <li><code>{event.type}</code><span>rev {event.revision}</span></li>)}</ol></details>
  </aside>;
}

function discoverContent(profile: MetaProgressV2, snapshot: GameSnapshot, content: ContentRegistry): MetaProgressV2 {
  const run = snapshot.run;
  if (!run) return profile;
  const next = structuredClone(profile);
  const add = (list: string[], values: Array<string | undefined>) => { for (const value of values) if (value && !list.includes(value)) list.push(value); };
  add(next.discoveredCharacterIds, [run.player.characterId]);
  add(next.discoveredCardIds, run.deck.cards.map((card) => card.definitionId));
  add(next.discoveredEnemyIds, run.combat?.enemies.map((enemy) => enemy.definitionId) ?? []);
  add(next.discoveredCollectibleIds, run.player.collectibleIds);
  add(next.discoveredCardIds, run.shop?.offers.map((offer) => offer.cardDefinitionId) ?? []);
  add(next.discoveredCollectibleIds, run.shop?.offers.map((offer) => offer.collectibleId) ?? []);
  for (const offer of run.reward?.offers ?? []) {
    const reward = content.rewards.get(offer.rewardDefinitionId);
    add(next.discoveredCardIds, [reward?.cardId]);
    add(next.discoveredCollectibleIds, [reward?.collectibleId]);
  }
  return next;
}

function definitionDescription(definition: { id: string; descriptionKey?: string; mechanismKey?: string; notesKey?: string }, content: ContentRegistry): string {
  if (definition.descriptionKey) return content.text(definition.descriptionKey);
  if (definition.mechanismKey) return content.text(definition.mechanismKey);
  if (definition.notesKey) return content.text(definition.notesKey);
  return definition.id;
}
