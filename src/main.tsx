import { render } from 'preact';
import { ContentRegistry } from './game/content';
import { createCoreEffectRegistry } from './game/effects';
import { GameKernel } from './game/kernel';
import { createCoreNodeHandlers } from './game/nodes';
import { BrowserSaveStore } from './game/save';
import { MetaProgressStore } from './game/meta';
import { AccountStore } from './game/accounts';
import { SettingsStore } from './game/settings';
import { wastelandContentPack } from './content/wasteland';
import { SceneBridge } from './phaser/adapters/sceneBridge';
import { createPhaserGame } from './phaser/createGame';
import { App } from './ui/App';
import './ui/styles.css';

const effects = createCoreEffectRegistry();
const nodes = createCoreNodeHandlers();
const content = new ContentRegistry(wastelandContentPack, effects);
const accountStore = new AccountStore();
let account = accountStore.current();
if (!account) {
  account = accountStore.create('玩家 1');
  const legacyRun = window.localStorage.getItem('roguelike-card-framework.run.v2');
  const legacyMeta = window.localStorage.getItem('roguelike-card-framework.meta.v2');
  if (legacyRun) window.localStorage.setItem(`roguelike-card-framework.run.v2.${account.id}`, legacyRun);
  if (legacyMeta) window.localStorage.setItem(`roguelike-card-framework.meta.v2.${account.id}`, legacyMeta);
  if (legacyRun || legacyMeta) { window.localStorage.removeItem('roguelike-card-framework.run.v2'); window.localStorage.removeItem('roguelike-card-framework.meta.v2'); }
}
const kernel = new GameKernel(content, effects, nodes);
const bridge = new SceneBridge();
bridge.setCommandHandler((command) => {
  try { kernel.dispatch(command); } catch { /* UI reports command errors; canvas clicks remain non-blocking. */ }
});
const saveStore = new BrowserSaveStore(window.localStorage, account.id);
const metaStore = new MetaProgressStore(window.localStorage, account.id);
const settingsStore = new SettingsStore();
let initialSave;
let startupWarning = '';

try {
  initialSave = saveStore.load();
} catch (error) {
  startupWarning = error instanceof Error ? error.message : String(error);
}

kernel.subscribe((snapshot, events) => bridge.publish(snapshot, events));
const phaserGame = createPhaserGame(bridge, content);
render(<App
  kernel={kernel}
  content={content}
  saveStore={saveStore}
  metaStore={metaStore}
  settingsStore={settingsStore}
  initialSave={initialSave}
  startupWarning={startupWarning}
  accountStore={accountStore}
  account={account}
  setGameVolume={(volume) => { phaserGame.sound.volume = volume; }}
/>, document.getElementById('ui-root')!);
