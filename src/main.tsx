import { render } from 'preact';
import { ContentRegistry } from './game/content';
import { createCoreEffectRegistry } from './game/effects';
import { GameKernel } from './game/kernel';
import { createCoreNodeHandlers } from './game/nodes';
import { BrowserSaveStore } from './game/save';
import { MetaProgressStore } from './game/meta';
import { SettingsStore } from './game/settings';
import { wastelandContentPack } from './content/wasteland';
import { SceneBridge } from './phaser/adapters/sceneBridge';
import { createPhaserGame } from './phaser/createGame';
import { App } from './ui/App';
import './ui/styles.css';

const effects = createCoreEffectRegistry();
const nodes = createCoreNodeHandlers();
const content = new ContentRegistry(wastelandContentPack, effects);
const kernel = new GameKernel(content, effects, nodes);
const bridge = new SceneBridge();
const saveStore = new BrowserSaveStore();
const metaStore = new MetaProgressStore();
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
  setGameVolume={(volume) => { phaserGame.sound.volume = volume; }}
/>, document.getElementById('ui-root')!);
