import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { cardCost, cardDescriptionKey, maxUpgradeLevel } from '../game/cards';
import type { ContentRegistry } from '../game/content';
import type { GameKernel } from '../game/kernel';
import { commandForKey } from '../game/input/bindings';
import { createInitialMetaProgress, type MetaProgressStore } from '../game/meta';
import type { BrowserSaveStore } from '../game/save';
import type { GameSettings, SettingsStore } from '../game/settings';
import type { AccountStore, LocalAccount } from '../game/accounts';
import type { CardDefinition, CardInstance, GameCommand, GameSnapshot, MetaProgressV2, RunSaveV2, ShopOfferState } from '../game/types';

interface AppProps {
  kernel: GameKernel;
  content: ContentRegistry;
  saveStore: BrowserSaveStore;
  metaStore: MetaProgressStore;
  settingsStore: SettingsStore;
  initialSave?: RunSaveV2;
  startupWarning?: string;
  accountStore: AccountStore;
  account: LocalAccount;
  setGameVolume?: (volume: number) => void;
}

type MenuView = 'main' | 'settings' | 'encyclopedia' | 'stats' | 'accounts';
type InfoView = 'deck' | 'collectibles';
type CardAnimation = { kind: 'upgrade' | 'remove' | 'transform'; definitionId?: string; previousDefinitionId?: string; id: number };

const phaseLabels: Record<string, string> = {
  map: '地图', combat: '战斗', reward: '奖励', shop: '商店', event: '事件', rest: '休整', result: '结算',
};

const cardIconUrls: Record<CardDefinition['type'], string> = {
  attack: new URL('../content/wasteland/assets/icon_card/attack.svg', import.meta.url).href,
  defense: new URL('../content/wasteland/assets/icon_card/defense.svg', import.meta.url).href,
  skill: new URL('../content/wasteland/assets/icon_card/skill.svg', import.meta.url).href,
  ability: new URL('../content/wasteland/assets/icon_card/ability.svg', import.meta.url).href,
};

const menuBackgroundVideo = new URL('../open.mp4', import.meta.url).href;

const mapLegendItems: Array<{ icon: string; name: string }> = [
  { icon: new URL('../content/wasteland/assets/icon_map/combat.svg', import.meta.url).href, name: '战斗' },
  { icon: new URL('../content/wasteland/assets/icon_map/elite.svg', import.meta.url).href, name: '精英' },
  { icon: new URL('../content/wasteland/assets/icon_map/shop.svg', import.meta.url).href, name: '商店' },
  { icon: new URL('../content/wasteland/assets/icon_map/event.svg', import.meta.url).href, name: '事件' },
  { icon: new URL('../content/wasteland/assets/icon_map/reward.svg', import.meta.url).href, name: '奖励' },
  { icon: new URL('../content/wasteland/assets/icon_map/rest.svg', import.meta.url).href, name: '休整' },
  { icon: new URL('../content/wasteland/assets/icon_map/boss.svg', import.meta.url).href, name: '首领战' },
];

const battleIconUrls: Record<string, string> = {
  'status.anger': new URL('../content/wasteland/assets/icon_battle/anger.svg', import.meta.url).href,
  'status.strong': new URL('../content/wasteland/assets/icon_battle/strong.svg', import.meta.url).href,
  'status.sharp': new URL('../content/wasteland/assets/icon_battle/sharp.svg', import.meta.url).href,
  'status.clear': new URL('../content/wasteland/assets/icon_battle/clear.svg', import.meta.url).href,
  'status.weak': new URL('../content/wasteland/assets/icon_battle/weak.svg', import.meta.url).href,
  'status.conceal': new URL('../content/wasteland/assets/icon_battle/conceal.svg', import.meta.url).href,
};

const resourceNames: Record<string, string> = {
  action: '行动力',
  serum: '能量剂',
};

const boonCopy: Record<string, { name: string; description: string }> = {
  'boon.max-card': { name: '炉火淬炼', description: '随机将初始牌组中的一张牌强化至最高等级。' },
  'boon.max-health': { name: '顽强血肉', description: '最大生命增加30%，并恢复至新的生命上限。' },
  'boon.gold-shop': { name: '意外横财', description: '获得100代币，并立即进入一次开局商店。' },
  'boon.resource': { name: '备用电池', description: '每回合行动力由3提高至4。' },
  'boon.greedy-coin': { name: '贪婪的金币', description: '获得局内收集品“贪婪的金币”。' },
  'boon.remove-three': { name: '轻装上路', description: '自行从初始牌组中删除3张牌。' },
};

export function App({ kernel, content, saveStore, metaStore, settingsStore, initialSave, startupWarning, accountStore, account: initialAccount, setGameVolume }: AppProps) {
  const [snapshot, setSnapshot] = useState<GameSnapshot>(kernel.getSnapshot());
  const [error, setError] = useState(startupWarning ?? '');
  const [debugOpen, setDebugOpen] = useState(false);
  const [saveState, setSaveState] = useState<'none' | 'in-progress' | 'finished'>(() => {
    if (!initialSave) return 'none';
    const game = initialSave.game;
    return game.run && game.phase !== 'result' && !game.run.result ? 'in-progress' : 'finished';
  });
  const [exitOpen, setExitOpen] = useState(false);
  const [inGameSettings, setInGameSettings] = useState(false);
  const [floorBanner, setFloorBanner] = useState<{ floor: number; id: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const [cardAnimation, setCardAnimation] = useState<CardAnimation | null>(null);
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [infoView, setInfoView] = useState<InfoView>();
  const [account, setAccount] = useState<LocalAccount>(initialAccount);
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
    const floorStarted = events.find((event) => event.type === 'floor.started');
    if (floorStarted && typeof floorStarted.payload.floor === 'number') {
      setFloorBanner({ floor: floorStarted.payload.floor, id: Date.now() });
    } else if (events.some((event) => event.type === 'run.started')) {
      setFloorBanner({ floor: 1, id: Date.now() });
    }
    const restUsed = events.find((event) => event.type === 'rest.used');
    if (restUsed) {
      const percent = Math.round(Number(restUsed.payload.percent ?? 0.3) * 100);
      setNotice({ text: `休整完成，恢复 ${percent}% 生命上限`, id: Date.now() });
    }
    const cardEvent = events.find((event) => ['deck.cardTransformed', 'deck.cardUpgraded', 'deck.cardsUpgraded', 'rest.upgraded', 'setup.cardRemoved', 'shop.purchased'].includes(event.type) && (event.type !== 'shop.purchased' || ['remove', 'upgrade'].includes(String(event.payload.type))));
    if (cardEvent) {
      const kind = cardEvent.type === 'deck.cardTransformed' ? 'transform' : cardEvent.type === 'setup.cardRemoved' || cardEvent.payload.type === 'remove' ? 'remove' : 'upgrade';
      const eventCardId = typeof cardEvent.payload.cardInstanceId === 'string'
        ? cardEvent.payload.cardInstanceId
        : Array.isArray(cardEvent.payload.cardInstanceIds) ? String(cardEvent.payload.cardInstanceIds[0] ?? '') : '';
      const definitionId = String(cardEvent.payload.definitionId ?? next.run?.deck.cards.find((card) => card.instanceId === eventCardId)?.definitionId ?? '');
      setCardAnimation({ kind, definitionId: definitionId || undefined, previousDefinitionId: typeof cardEvent.payload.previousDefinitionId === 'string' ? cardEvent.payload.previousDefinitionId : undefined, id: Date.now() });
    }
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
      setSaveState(snapshot.phase === 'result' ? 'finished' : 'in-progress');
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
      if (exitOpen) return;
      const command = commandForKey(event, snapshot, settings.bindings);
      if (command) { event.preventDefault(); dispatch(command); }
      if (event.key === '`') setDebugOpen((value) => !value);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [snapshot, settings.bindings, exitOpen]);

  useEffect(() => {
    if (snapshot.phase === 'menu') setMenuView('main');
  }, [snapshot.phase]);

  const continueRun = () => {
    try {
      const save = saveStore.load();
      if (!save) { setSaveState('none'); return; }
      kernel.restoreSave(save);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const switchAccount = (next: LocalAccount) => {
    try {
      const selected = accountStore.switch(next.id);
      saveStore.setAccountId(selected.id); metaStore.setAccountId(selected.id);
      kernel.resetToMenu(); setSnapshot(kernel.getSnapshot()); setAccount(selected);
      const save = saveStore.load();
      setSaveState(save?.game.run && save.game.phase !== 'result' && !save.game.run.result ? 'in-progress' : 'none');
      setMeta(metaStore.load(createInitialMetaProgress(content.pack))); setMenuView('main'); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const createAccount = (nickname: string) => {
    try { switchAccount(accountStore.create(nickname)); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const removeAccount = (id: string) => {
    if (!window.confirm('确定删除该账号及其全部存档、成长数据和统计吗？')) return;
    try {
      saveStore.setAccountId(id); saveStore.clear(); metaStore.setAccountId(id); metaStore.save(createInitialMetaProgress(content.pack));
      accountStore.remove(id);
      const next = accountStore.current();
      if (next) switchAccount(next); else { const created = accountStore.create('玩家 1'); switchAccount(created); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const dismissFloorBanner = useCallback(() => setFloorBanner(null), []);

  const run = snapshot.run;
  const showHud = run && ['map', 'combat', 'reward', 'shop', 'event', 'rest', 'result'].includes(snapshot.phase);

  return (
    <main class="ui-shell">
      {snapshot.phase === 'menu' && menuView === 'main' && <video class="menu-background" src={menuBackgroundVideo} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" />}
      {snapshot.phase === 'menu' && menuView === 'main' && <h1 class="game-title">异变独行</h1>}
      {showHud && (
        <header class="topbar">
          <div class="stat"><span>阶段</span><strong>{phaseLabels[snapshot.phase] ?? snapshot.phase}</strong></div>
          <div class="stat"><span>区域</span><strong>{run.floor}/{run.totalFloors}</strong></div>
          <div class="stat"><span>生命</span><strong>{run.combat?.player.health ?? run.player.health}/{run.player.maxHealth}</strong></div>
          <div class="stat"><span>代币</span><strong>{run.combat?.player.gold ?? run.player.gold}</strong></div>
          <div class="topbar-spacer" />
          <button class="ghost" onClick={() => setInfoView('deck')}>卡包</button>
          <button class="ghost" onClick={() => setInfoView('collectibles')}>收集品</button>
          <button class="ghost" data-testid="exit-run" onClick={() => setExitOpen(true)}>设置</button>
          <button class="ghost" onClick={() => setDebugOpen((value) => !value)}>开发面板</button>
        </header>
      )}

      {error && <div class="error-banner" role="alert">{error}<button onClick={() => setError('')}>关闭</button></div>}

      {snapshot.phase === 'menu' && menuView === 'main' && (
        <section class="center-panel menu-panel" data-testid="menu">
          <p class="eyebrow">WASTELAND // 尘沙</p>
          <div class="menu-actions">
            {saveState === 'in-progress'
              ? <button class="primary" data-testid="new-run" onClick={continueRun}>继续游戏</button>
              : <button class="primary" data-testid="new-run" onClick={() => dispatch({ type: 'NEW_RUN' })}>开始游戏</button>}
            <button onClick={() => setMenuView('settings')}>设置</button>
            <button disabled={saveState === 'in-progress'} onClick={() => setMenuView('encyclopedia')}>百科</button>
            <button disabled={saveState === 'in-progress'} onClick={() => setMenuView('stats')}>统计</button>
            <button onClick={() => setMenuView('accounts')}>账号管理</button>
          </div>
          <small class="menu-meta">当前账号：{account.nickname}</small>
          {saveState === 'in-progress' && <small class="menu-meta menu-lock-hint">检测到未完成的探索，仅可继续游戏或调整设置。</small>}
          <small class="menu-meta">局外养成代币：{meta.tokens}</small>
        </section>
      )}

      {snapshot.phase === 'menu' && menuView === 'settings' && <SettingsPanel settings={settings} setSettings={setSettings} back={() => setMenuView('main')} setError={setError} />}
      {snapshot.phase === 'menu' && menuView === 'encyclopedia' && <EncyclopediaPanel content={content} meta={meta} back={() => setMenuView('main')} />}
      {snapshot.phase === 'menu' && menuView === 'stats' && <StatsPanel content={content} meta={meta} back={() => setMenuView('main')} />}
      {snapshot.phase === 'menu' && menuView === 'accounts' && <AccountPanel accounts={accountStore.list()} currentId={account.id} onSwitch={switchAccount} onCreate={createAccount} onRemove={removeAccount} back={() => setMenuView('main')} />}

      {snapshot.phase === 'character-select' && <CharacterSelect content={content} meta={meta} dispatch={dispatch} />}
      {snapshot.phase === 'boon-select' && run?.setup && <BoonSelect boonIds={run.setup.boonOffers} content={content} dispatch={dispatch} />}
      {snapshot.phase === 'boon-remove' && run?.setup && <StartingCardRemoval run={run} content={content} dispatch={dispatch} />}
      {snapshot.phase === 'theme-select' && <ThemeSelect dispatch={dispatch} />}
      {snapshot.phase === 'map' && run && <MapPanel snapshot={snapshot} />}
      {snapshot.phase === 'map' && (
        <aside class="map-legend" data-testid="map-legend" aria-label="地图图例">
          <p class="eyebrow">MAP LEGEND</p>
          <div class="legend-grid">{mapLegendItems.map((item) => <span class="legend-row" key={item.name}><img src={item.icon} alt="" /><em>{item.name}</em></span>)}</div>
        </aside>
      )}
      {snapshot.phase === 'combat' && run?.combat && <CombatPanel snapshot={snapshot} content={content} bindings={settings.bindings.hand} endTurnKey={settings.bindings.endTurn} dispatch={dispatch} />}
      {snapshot.phase === 'reward' && run?.reward && <RewardPanel snapshot={snapshot} content={content} dispatch={dispatch} />}
      {snapshot.phase === 'shop' && run?.shop && <ShopPanel snapshot={snapshot} content={content} dispatch={dispatch} />}
      {snapshot.phase === 'event' && run?.event && <EventPanel snapshot={snapshot} content={content} dispatch={dispatch} />}
      {snapshot.phase === 'rest' && run && <RestPanel run={run} content={content} dispatch={dispatch} />}
      {snapshot.phase === 'result' && run?.result && (
        <section class="center-panel result-panel" data-testid="result">
          <p class="eyebrow">RUN COMPLETE</p>
          <h2>{run.result.outcome === 'victory' ? '你穿过了风沙' : `${content.text(content.characters.get(run.player.characterId)?.nameKey ?? '你')}倒下了`}</h2>
          <p>到达层数：{run.floor}/{run.totalFloors}</p>
          <p>完成战斗：{run.metrics.battlesStarted}</p>
          <p>已处理节点：{run.result.completedNodes}</p>
          <p>结局分数：<strong>{run.result.score}</strong></p>
          <p>获得局外养成代币：<strong>{run.result.metaTokens}</strong></p>
          <div class="button-row"><button class="primary" onClick={() => dispatch({ type: 'NEW_RUN' })}>开始新游戏</button><button onClick={() => dispatch({ type: 'RETURN_TO_MENU' })}>返回主菜单</button></div>
        </section>
      )}

      {infoView && run && <RunInfoPanel view={infoView} snapshot={snapshot} content={content} close={() => setInfoView(undefined)} />}

      {exitOpen && run && (
        <div class="modal-backdrop" data-testid="exit-modal" onClick={() => setExitOpen(false)}>
          <section class="center-panel" role="dialog" aria-modal="true" aria-label="设置" onClick={(event) => event.stopPropagation()}>
            {inGameSettings ? <SettingsPanel settings={settings} setSettings={setSettings} back={() => setInGameSettings(false)} setError={setError} /> : <>
            <p class="eyebrow">SETTINGS</p>
            <h2>设置</h2>
            <p>退出到主菜单后，当前进度会自动保存，之后可以从主菜单选择「继续游戏」接着玩。</p>
            <div class="button-row">
              <button class="primary" onClick={() => { setExitOpen(false); dispatch({ type: 'RETURN_TO_MENU' }); }}>返回主菜单</button>
              <button onClick={() => setInGameSettings(true)}>游戏设置</button>
              <button onClick={() => setExitOpen(false)}>取消</button>
            </div>
            </>}
          </section>
        </div>
      )}

      {floorBanner && <FloorBanner key={floorBanner.id} floor={floorBanner.floor} reducedMotion={settings.reducedMotion} onDone={dismissFloorBanner} />}

      {notice && <TransientNotice key={notice.id} text={notice.text} onDone={() => setNotice(null)} />}
      {cardAnimation && <CardChangeAnimation key={cardAnimation.id} animation={cardAnimation} content={content} onDone={() => setCardAnimation(null)} />}

      {showHud && <button class="future-action-button" aria-label="特殊玩法（暂未开放）" disabled title="特殊玩法开发中" />}

      {debugOpen && run && <DebugPanel kernel={kernel} snapshot={snapshot} content={content} saveStore={saveStore} dispatch={dispatch} close={() => setDebugOpen(false)} />}
    </main>
  );
}

function RestPanel({ run, content, dispatch }: { run: NonNullable<GameSnapshot['run']>; content: ContentRegistry; dispatch: (command: GameCommand) => void }) {
  const [choosingUpgrade, setChoosingUpgrade] = useState(false);
  const eligible = run.deck.cards.filter((card) => card.upgradeLevel < maxUpgradeLevel(content.cards.get(card.definitionId)!));
  return <section class="center-panel rest-panel" data-testid="rest"><p class="eyebrow">REST STOP</p><h2>休整节点</h2><p>选择一种方式结束本次休整。</p><div class="rest-choice-grid"><button class="selection-card available" onClick={() => dispatch({ type: 'CHOOSE_REST', option: 'heal' })}><strong>休息</strong><p>恢复 30% 最大生命值。</p></button><button class="selection-card available" disabled={eligible.length === 0} onClick={() => setChoosingUpgrade(true)}><strong>升级卡牌</strong><p>进入卡牌界面，选择一张尚未达到强化上限的卡牌。</p></button></div>{choosingUpgrade && <CardChoiceModal title="选择要强化的卡牌" cards={eligible} content={content} cancel={() => setChoosingUpgrade(false)} choose={(card) => dispatch({ type: 'CHOOSE_REST', option: 'upgrade', cardInstanceId: card.instanceId })} />}</section>;
}

function CardChoiceModal({ title, cards, content, choose, cancel }: { title: string; cards: CardInstance[]; content: ContentRegistry; choose: (card: CardInstance) => void; cancel: () => void }) {
  return <div class="modal-backdrop" onClick={cancel}><section class="center-panel wide card-choice-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><p class="eyebrow">CARD CHOICE</p><h2>{title}</h2><div class="compact-card-grid">{cards.map((card) => { const definition = content.cards.get(card.definitionId)!; return <button class="selection-card available" key={card.instanceId} onClick={() => choose(card)}><strong>{content.text(definition.nameKey)}{card.upgradeLevel ? ` +${card.upgradeLevel}` : ''}</strong><p>{content.text(cardDescriptionKey(definition, card))}</p></button>; })}</div><button onClick={cancel}>取消</button></section></div>;
}

function CardChangeAnimation({ animation, content, onDone }: { animation: CardAnimation; content: ContentRegistry; onDone: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onDone, 1150); return () => window.clearTimeout(timer); }, [onDone]);
  const title = animation.kind === 'transform' ? '卡牌变化' : animation.kind === 'remove' ? '卡牌已删除' : '卡牌已强化';
  const next = animation.definitionId ? content.cards.get(animation.definitionId) : undefined;
  const previous = animation.previousDefinitionId ? content.cards.get(animation.previousDefinitionId) : undefined;
  return <div class={`card-change-animation ${animation.kind}`} role="status" aria-live="polite"><div><strong>{title}</strong><div class="card-change-cards">{previous && <CardPreview definition={previous} content={content} />} {previous && next && <span class="card-change-arrow">→</span>} {next && <CardPreview definition={next} content={content} />}</div>{!next && <span class="card-change-mark">✦</span>}</div></div>;
}

function CardPreview({ definition, content }: { definition: CardDefinition; content: ContentRegistry }) {
  return <article class={`card-preview card-${definition.type} rarity-${definition.rarity ?? 'gray'}`}><span class="card-preview-cost">{definition.cost.amount}</span><img src={cardIconUrls[definition.type]} alt="" /><strong>{content.text(definition.nameKey)}</strong><p>{content.text(definition.descriptionKey)}</p><small>{definition.type}</small></article>;
}

function AccountPanel({ accounts, currentId, onSwitch, onCreate, onRemove, back }: { accounts: LocalAccount[]; currentId: string; onSwitch: (account: LocalAccount) => void; onCreate: (nickname: string) => void; onRemove: (id: string) => void; back: () => void }) {
  const [nickname, setNickname] = useState('');
  return <section class="center-panel setup-panel account-panel" data-testid="accounts"><p class="eyebrow">ACCOUNT MANAGEMENT</p><h2>账号管理</h2><div class="account-list">{accounts.map((item) => <div class="account-row" key={item.id}><strong>{item.nickname}</strong><small>{item.id === currentId ? '当前账号' : new Date(item.lastUsedAt).toLocaleString()}</small><div class="button-row"><button disabled={item.id === currentId} onClick={() => onSwitch(item)}>切换</button><button onClick={() => onRemove(item.id)}>删除</button></div></div>)}</div><div class="inline-form"><input aria-label="新账号昵称" value={nickname} onInput={(event) => setNickname(event.currentTarget.value)} placeholder="输入昵称" /><button class="primary" onClick={() => { onCreate(nickname); setNickname(''); }}>创建账号</button></div><button onClick={back}>返回</button></section>;
}

function CharacterSelect({ content, meta, dispatch }: { content: ContentRegistry; meta: MetaProgressV2; dispatch: (command: GameCommand) => void }) {
  const rules = content.pack.ruleSet;
  return <section class="center-panel wide setup-panel" data-testid="character-select"><p class="eyebrow">STEP 01 // 选择角色</p><h2>谁走进风沙？</h2><div class="selection-grid">
    {content.pack.characters.map((character) => {
      const unlocked = character.unlockCost === 0 || meta.unlockedCharacterIds.includes(character.id);
      const collectibleId = (character.startingCollectibleIds ?? rules.startingCollectibleIds)[0];
      const collectible = collectibleId ? content.collectibles.get(collectibleId) : undefined;
      return <button class={`selection-card${unlocked ? ' available' : ''}`} disabled={!unlocked} onClick={() => dispatch({ type: 'SELECT_CHARACTER', characterId: character.id })}><span>{unlocked ? '可用角色' : '未解锁'}</span><strong>{content.text(character.nameKey)}</strong><p>{content.text(character.descriptionKey)}</p><small>生命 {character.maxHealth} · {resourceNames[character.resourceId] ?? character.resourceId} {rules.resources[character.resourceId]?.perTurn ?? 3}{collectible ? ` · 初始${content.text(collectible.nameKey)}` : ''}</small></button>;
    })}
    <button class="selection-card" disabled><span>开发中</span><strong>未解锁角色</strong><p>尚未有人从这条路线回来。</p></button>
  </div></section>;
}

function BoonSelect({ boonIds, content, dispatch }: { boonIds: string[]; content: ContentRegistry; dispatch: (command: GameCommand) => void }) {
  return <section class="center-panel wide setup-panel" data-testid="boon-select"><p class="eyebrow">STEP 02 // 开局增益</p><h2>只带走一项</h2><div class="selection-grid">{boonIds.map((id) => {
    const collectible = id === 'boon.greedy-coin' ? content.collectibles.get('collectible.greedy-coin') : undefined;
    return <button class="selection-card available" onClick={() => dispatch({ type: 'SELECT_BOON', boonId: id })}><span>随机候选</span><strong className={collectible ? `collectible-name rarity-${collectible.rarity ?? 'blue'}` : undefined} title={collectible ? content.text(collectible.descriptionKey) : undefined}>{boonCopy[id]?.name ?? id}</strong><p>{boonCopy[id]?.description}</p></button>;
  })}</div></section>;
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

function MapPanel({ snapshot }: { snapshot: GameSnapshot }) {
  const run = snapshot.run!;
  return <aside class="map-actions" data-testid="map-panel"><p class="eyebrow">FLOOR {run.floor} / {run.totalFloors}</p><span class="map-click-hint">点击高亮图标移动 · 滚轮滑动查看路线</span></aside>;
}

function RunInfoPanel({ view, snapshot, content, close }: { view: InfoView; snapshot: GameSnapshot; content: ContentRegistry; close: () => void }) {
  const run = snapshot.run!;
  return <section class="center-panel wide run-info-panel" data-testid={`run-${view}`}><div class="debug-heading"><div><p class="eyebrow">RUN INFORMATION</p><h2>{view === 'deck' ? `卡包 · ${run.deck.cards.length} 张` : `收集品 · ${run.player.collectibleIds.length} 件`}</h2></div><button onClick={close}>关闭</button></div>{view === 'deck' ? <div class="archive-grid">{run.deck.cards.map((card) => { const definition = content.cards.get(card.definitionId)!; return <article class={`rarity-${definition.rarity ?? 'gray'}`}><img class="info-icon" src={cardIconUrls[definition.type]} alt="" /><strong>{content.text(definition.nameKey)}{card.upgradeLevel ? ` +${card.upgradeLevel}` : ''}</strong><p>{content.text(cardDescriptionKey(definition, card))}</p></article>; })}</div> : <div class="archive-grid">{run.player.collectibleIds.map((id) => { const collectible = content.collectibles.get(id)!; return <article class={`rarity-${collectible.rarity ?? 'blue'}`} title={content.text(collectible.descriptionKey)}><strong>{content.text(collectible.nameKey)}</strong><p>{content.text(collectible.descriptionKey)}</p></article>; })}</div>}</section>;
}

interface CardDragState {
  cardInstanceId: string;
  startX: number;
  startY: number;
  startCenterY: number;
  dx: number;
  dy: number;
}

function CombatPanel({ snapshot, content, bindings, endTurnKey, dispatch }: { snapshot: GameSnapshot; content: ContentRegistry; bindings: string[]; endTurnKey: string; dispatch: (command: GameCommand) => void }) {
  const combat = snapshot.run!.combat!;
  const [selectedTarget, setSelectedTarget] = useState(combat.enemies.find((enemy) => enemy.health > 0)?.instanceId);
  const [drag, setDrag] = useState<CardDragState | null>(null);
  useEffect(() => {
    if (!combat.enemies.some((enemy) => enemy.instanceId === selectedTarget && enemy.health > 0)) setSelectedTarget(combat.enemies.find((enemy) => enemy.health > 0)?.instanceId);
  }, [combat.enemies, selectedTarget]);

  const playLineY = () => window.innerHeight * 0.56;
  const inPlayZone = drag ? drag.startCenterY + drag.dy <= playLineY() : false;

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => setDrag((current) => current ? { ...current, dx: event.clientX - current.startX, dy: event.clientY - current.startY } : current);
    const onUp = () => setDrag((current) => {
      if (!current) return current;
      if (current.startCenterY + current.dy <= window.innerHeight * 0.56) {
        dispatch({ type: 'PLAY_CARD', cardInstanceId: current.cardInstanceId, targetId: selectedTarget });
      }
      return null;
    });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [drag !== null, selectedTarget]);

  const beginDrag = (event: PointerEvent, cardInstanceId: string, element: HTMLElement) => {
    if (event.button !== 0) return;
    event.preventDefault();
    try { element.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
    const rect = element.getBoundingClientRect();
    setDrag({ cardInstanceId, startX: event.clientX, startY: event.clientY, startCenterY: rect.top + rect.height / 2, dx: 0, dy: 0 });
  };

  const character = content.characters.get(combat.player.characterId)!;
  const resourceId = character.resourceId;
  const resourceAmount = combat.player.resources[resourceId];
  const clarity = combat.player.statuses.find((status) => status.definitionId === 'status.clear')?.stacks ?? 0;
  const concealStacks = combat.player.statuses.find((status) => status.definitionId === 'status.conceal')?.stacks ?? 0;
  const concealedAttacksUsed = combat.concealAttacksUsed ?? 0;
  return <section class="combat-ui" data-testid="combat">
    <div class={`play-zone${drag ? ' visible' : ''}${inPlayZone ? ' active' : ''}`} aria-hidden="true"><span>出牌区</span></div>
    <div class="enemy-selector">{combat.enemies.map((enemy) => { const definition = content.enemies.get(enemy.definitionId)!; const intent = definition.intents[enemy.intentIndex % definition.intents.length]; return <button class={selectedTarget === enemy.instanceId ? 'selected' : ''} disabled={enemy.health <= 0} onClick={() => setSelectedTarget(enemy.instanceId)}><strong>{content.text(definition.nameKey)}</strong><span>HP {enemy.health} · 防护 {enemy.block}</span><small>意图：{content.text(intent.nameKey)}</small></button>; })}</div>
    <div class="combat-controls"><span>回合 {combat.turn}</span>{resourceAmount !== undefined && <span>{resourceNames[resourceId] ?? resourceId}：{resourceAmount}</span>}<button data-testid="end-turn" onClick={() => dispatch({ type: 'END_TURN' })}>结束回合 <kbd>{endTurnKey.toUpperCase()}</kbd></button></div>
    <div class="battle-statuses" aria-label="角色增益与减益">{combat.player.statuses.map((status) => { const definition = content.statuses.get(status.definitionId)!; return <span title={`${content.text(definition.descriptionKey)}${status.duration !== undefined ? ` · 剩余${status.duration}回合` : ''}`}><img src={battleIconUrls[status.definitionId]} alt="" /><b>{content.text(definition.nameKey)}</b><em>{status.stacks}</em></span>; })}</div>
    <div class="hand" aria-label="手牌">{combat.hand.map((card, index) => { const definition = content.cards.get(card.definitionId)!; const baseCost = cardCost(definition, card); const costAmount = Math.max(0, baseCost.amount - (definition.type === 'skill' ? clarity : 0)); const cost = { ...baseCost, amount: definition.type === 'attack' && concealStacks > concealedAttacksUsed ? 0 : costAmount }; const affordable = combat.player.resources[cost.resourceId] >= cost.amount; const cardDrag = drag?.cardInstanceId === card.instanceId ? drag : undefined; return <CardButton key={card.instanceId} card={card} definition={definition} content={content} shortcut={bindings[index]} costOverride={cost.amount} disabled={!affordable} drag={cardDrag} onDragStart={(event, element) => beginDrag(event, card.instanceId, element)} />; })}</div>
  </section>;
}

function CardButton({ definition, card, content, shortcut, costOverride, disabled, drag, onDragStart }: { definition: CardDefinition; card?: CardInstance; content: ContentRegistry; shortcut?: string; costOverride?: number; disabled?: boolean; drag?: CardDragState; onDragStart: (event: PointerEvent, element: HTMLElement) => void }) {
  const cost = card ? cardCost(definition, card) : definition.cost;
  const description = content.text(cardDescriptionKey(definition, card));
  const descriptionFont = description.length >= 26 ? '0.6rem' : description.length >= 18 ? '0.68rem' : '0.78rem';
  return <button
    class={`card card-${definition.type} rarity-${definition.rarity ?? 'gray'} ${(card?.upgradeLevel ?? 0) > 0 ? 'upgraded' : ''}${drag ? ' dragging' : ''}`}
    data-testid={`card-${definition.id}`}
    disabled={disabled}
    style={drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.08)`, zIndex: 60, transition: 'none' } : undefined}
    onPointerDown={(event) => { if (!disabled) onDragStart(event, event.currentTarget); }}
  ><span class="card-cost">{costOverride ?? cost.amount}</span>{shortcut !== undefined && <kbd>{shortcut.toUpperCase()}</kbd>}<img class="card-art" src={cardIconUrls[definition.type]} alt="" /><strong>{content.text(definition.nameKey)}{card?.upgradeLevel ? ` +${card.upgradeLevel}` : ''}</strong><p style={{ fontSize: descriptionFont }}>{description}</p><small>{definition.type} · {definition.playDestination}</small></button>;
}

function RewardPanel({ snapshot, content, dispatch }: { snapshot: GameSnapshot; content: ContentRegistry; dispatch: (command: GameCommand) => void }) {
  const rewardState = snapshot.run!.reward!;
  const title = rewardState.source === 'boss' ? '首领战利品：三选一' : '发现一份物资';
  return <section class="center-panel wide" data-testid="reward"><p class="eyebrow">SALVAGE // {rewardState.source}</p><h2>{title}</h2><div class="reward-grid">{rewardState.offers.map((offer) => { const reward = content.rewards.get(offer.rewardDefinitionId)!; const collectible = reward.type === 'collectible' && reward.collectibleId ? content.collectibles.get(reward.collectibleId) : undefined; return <button class="reward-offer" onClick={() => dispatch({ type: 'CHOOSE_REWARD', rewardOfferId: offer.id })}><small>{reward.type}</small><strong className={collectible ? `collectible-name rarity-${collectible.rarity ?? 'blue'}` : undefined} title={collectible ? content.text(collectible.descriptionKey) : undefined}>{content.text(reward.nameKey)}</strong><p>{content.text(reward.descriptionKey)}</p></button>; })}</div>{rewardState.canSkip && <button onClick={() => dispatch({ type: 'CHOOSE_REWARD' })}>放弃奖励</button>}</section>;
}

function ShopPanel({ snapshot, content, dispatch }: { snapshot: GameSnapshot; content: ContentRegistry; dispatch: (command: GameCommand) => void }) {
  const run = snapshot.run!;
  const [selectedCardId, setSelectedCardId] = useState(run.deck.cards[0]?.instanceId ?? '');
  useEffect(() => {
    if (!run.deck.cards.some((card) => card.instanceId === selectedCardId)) setSelectedCardId(run.deck.cards[0]?.instanceId ?? '');
  }, [run.deck.cards, selectedCardId]);
  const cardOffers = run.shop!.offers.filter((offer) => offer.type === 'card');
  const collectibleOffers = run.shop!.offers.filter((offer) => offer.type === 'collectible');
  const serviceOffers = run.shop!.offers.filter((offer) => offer.type !== 'card' && offer.type !== 'collectible');
  const renderOffer = (offer: ShopOfferState) => {
    const card = offer.cardDefinitionId ? content.cards.get(offer.cardDefinitionId) : undefined;
    const collectible = offer.collectibleId ? content.collectibles.get(offer.collectibleId) : undefined;
    const title = card ? content.text(card.nameKey) : collectible ? content.text(collectible.nameKey) : offer.type === 'heal' ? '生命恢复 30%' : offer.type === 'remove' ? '删除卡牌' : '强化卡牌';
    const needsCard = offer.type === 'remove' || offer.type === 'upgrade';
    const price = offer.basePrice + offer.priceStep * offer.purchaseCount;
    const selected = run.deck.cards.find((instance) => instance.instanceId === selectedCardId);
    const unavailableSelection = offer.type === 'upgrade' && selected ? selected.upgradeLevel >= maxUpgradeLevel(content.cards.get(selected.definitionId)!) : false;
    const rarity = card?.rarity ?? collectible?.rarity ?? 'gray';
    return <article class={`shop-offer rarity-${rarity}`} title={collectible ? content.text(collectible.descriptionKey) : undefined}><small>{offer.type}{rarity ? ` · ${rarity}` : ''}{offer.purchaseCount > 0 ? ` · 已使用${offer.purchaseCount}次` : ''}</small><strong>{title}</strong>{card && <p>{content.text(card.descriptionKey)}</p>}{collectible && <p>{content.text(collectible.descriptionKey)}</p>}{needsCard && <select value={selectedCardId} onChange={(event) => setSelectedCardId(event.currentTarget.value)}>{run.deck.cards.map((instance) => <option value={instance.instanceId}>{content.text(content.cards.get(instance.definitionId)!.nameKey)}{instance.upgradeLevel ? ` +${instance.upgradeLevel}` : ''}</option>)}</select>}<button disabled={offer.soldOut || run.player.gold < price || unavailableSelection} onClick={() => dispatch({ type: 'BUY_SHOP_OFFER', offerId: offer.id, cardInstanceId: needsCard ? selectedCardId : undefined })}>{offer.soldOut ? '已售出' : `${price} 代币`}</button></article>;
  };
  return <section class="center-panel wide shop-surface" data-testid="shop"><p class="eyebrow">TRADER // {run.player.gold} TOKENS</p><h2>{run.shop!.returnPhase === 'theme-select' ? '开局商店' : '废墟商店'}</h2><h3>卡牌柜台</h3><div class="shop-grid">{cardOffers.map(renderOffer)}</div><h3>收集品柜台</h3><div class="shop-grid">{collectibleOffers.map(renderOffer)}</div><h3>服务</h3><div class="shop-grid">{serviceOffers.map(renderOffer)}</div><button onClick={() => dispatch({ type: 'LEAVE_SHOP' })}>离开商店</button></section>;
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
  const [floor, setFloor] = useState(String(snapshot.run?.floor ?? 1));
  const eventLines = useMemo(() => kernel.getEventLog().slice(-12).reverse(), [kernel, snapshot.revision]);
  return <aside class="debug-panel" data-testid="debug-panel"><div class="debug-heading"><div><p class="eyebrow">DEVELOPER</p><h2>开发面板</h2></div><button onClick={close}>关闭</button></div>
    <details open><summary>状态快照</summary><pre>{JSON.stringify(snapshot, null, 2)}</pre></details>
    <details><summary>资源调试</summary>{resourceIds.map((resourceId) => <div class="inline-form"><code>{resourceId}</code><input type="number" value={resourceAmount} onInput={(event) => setResourceAmount(event.currentTarget.value)} /><button onClick={() => dispatch({ type: 'DEBUG_SET_RESOURCE', resourceId, amount: Number(resourceAmount) })}>设置</button></div>)}</details>
    <details open><summary>战斗与层数</summary><div class="button-row"><button class="primary" disabled={snapshot.phase !== 'combat'} onClick={() => dispatch({ type: 'DEBUG_WIN_COMBAT' })}>一键战斗胜利</button></div>{snapshot.run && <div class="inline-form"><label for="debug-floor">跳转层数</label><input id="debug-floor" type="number" min="1" max={snapshot.run.totalFloors} value={floor} onInput={(event) => setFloor(event.currentTarget.value)} /><button onClick={() => dispatch({ type: 'DEBUG_JUMP_FLOOR', floor: Number(floor) })}>跳转</button></div>}</details>
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

function FloorBanner({ floor, reducedMotion, onDone }: { floor: number; reducedMotion: boolean; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setLeaving(true), 2000);
    const doneTimer = window.setTimeout(onDone, 2600);
    return () => { window.clearTimeout(leaveTimer); window.clearTimeout(doneTimer); };
  }, [onDone]);
  return (
    <div class={`floor-banner${leaving ? ' leaving' : ''}${reducedMotion ? ' reduced-motion' : ''}`} data-testid="floor-banner" aria-live="polite">
      <span class="floor-banner-label">FLOOR {floor}</span>
      <strong>第 {floor} 层</strong>
    </div>
  );
}

function TransientNotice({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const doneTimer = window.setTimeout(onDone, 1900);
    return () => window.clearTimeout(doneTimer);
  }, [onDone]);
  return <div class="transient-notice" role="status" aria-live="polite">{text}</div>;
}
