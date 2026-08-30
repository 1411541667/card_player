import Phaser from 'phaser';
import type { ContentRegistry } from '../game/content';
import type { SceneBridge } from './adapters/sceneBridge';
import { GameScene } from './scenes/GameScene';

export function createPhaserGame(bridge: SceneBridge, content: ContentRegistry): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    backgroundColor: '#0d1118',
    scene: [new GameScene(bridge, content)],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    render: { antialias: true, pixelArt: false, roundPixels: true },
    audio: { disableWebAudio: false },
  });
}
