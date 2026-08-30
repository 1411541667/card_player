import Phaser from 'phaser';
import type { ContentRegistry } from '../../game/content';
import type { DomainEvent, GameSnapshot } from '../../game/types';
import type { SceneBridge } from '../adapters/sceneBridge';

export class GameScene extends Phaser.Scene {
  private layer?: Phaser.GameObjects.Container;
  private snapshot: GameSnapshot = { phase: 'menu', revision: 0 };
  private unsubscribe?: () => void;

  constructor(private readonly bridge: SceneBridge, private readonly content: ContentRegistry) {
    super({ key: 'GameScene' });
  }

  preload(): void {
    for (const asset of this.content.pack.assets) {
      if (asset.type === 'image') this.load.image(asset.key, asset.url);
      if (asset.type === 'audio') this.load.audio(asset.key, asset.url);
      if (asset.type === 'spritesheet' && asset.frameWidth && asset.frameHeight) {
        this.load.spritesheet(asset.key, asset.url, { frameWidth: asset.frameWidth, frameHeight: asset.frameHeight });
      }
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0d1118');
    this.unsubscribe = this.bridge.subscribe((snapshot, events) => {
      this.snapshot = snapshot;
      this.renderSnapshot();
      this.playEvents(events);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.renderSnapshot, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
  }

  private renderSnapshot(): void {
    this.layer?.destroy(true);
    this.layer = this.add.container(0, 0);
    const width = this.scale.width;
    const height = this.scale.height;
    const background = this.add.graphics();
    background.fillGradientStyle(0x101620, 0x101620, 0x080b10, 0x080b10, 1);
    background.fillRect(0, 0, width, height);
    this.layer.add(background);

    if (this.snapshot.phase === 'map' && this.snapshot.run) this.renderMap(width, height);
    else if (this.snapshot.phase === 'combat' && this.snapshot.run?.combat) this.renderCombat(width, height);
    else this.renderAmbient(width, height);
  }

  private renderAmbient(width: number, height: number): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(2, 0x485a70, 0.45);
    const radius = Math.min(width, height) * 0.22;
    graphics.strokeCircle(width / 2, height / 2, radius);
    graphics.strokeCircle(width / 2, height / 2, radius * 0.68);
    graphics.lineBetween(width / 2 - radius, height / 2, width / 2 + radius, height / 2);
    graphics.lineBetween(width / 2, height / 2 - radius, width / 2, height / 2 + radius);
    this.layer?.add(graphics);
  }

  private renderMap(width: number, height: number): void {
    const map = this.snapshot.run!.map;
    const maxLayer = Math.max(...map.nodes.map((node) => node.layer), 1);
    const maxColumn = Math.max(...map.nodes.map((node) => node.column), 1);
    const marginLeft = width > 900 ? 340 : 80;
    const marginRight = 80;
    const marginY = 110;
    const position = (node: { layer: number; column: number }) => ({
      x: marginLeft + (node.column / Math.max(1, maxColumn)) * (width - marginLeft - marginRight) + (node.layer % 2 === 0 ? -14 : 14),
      y: marginY + (node.layer / maxLayer) * (height - marginY * 2),
    });
    const graphics = this.add.graphics();
    for (const node of map.nodes) {
      const from = position(node);
      for (const connectionId of node.connections) {
        const target = map.nodes.find((candidate) => candidate.id === connectionId);
        if (target) {
          const to = position(target);
          this.dashedLine(graphics, from.x, from.y, to.x, to.y, 0x627486, node.visited ? 0.75 : 0.42);
        }
      }
    }
    for (const node of map.nodes) {
      const point = position(node);
      const palette: Record<string, number> = { 'core.combat': 0xb64d48, 'core.elite': 0x7f4fb0, 'core.boss': 0xd1a45b, 'core.shop': 0x397fc0, 'core.event': 0xd2a72b, 'core.reward': 0x4f9a5c, 'core.rest': 0x66707d };
      const color = node.visited ? 0x46525b : node.available ? (palette[node.handlerId] ?? 0x70b8ff) : 0x27323b;
      const size = node.handlerId === 'core.boss' ? 24 : 17;
      const diamond = [
        new Phaser.Geom.Point(point.x, point.y - size * 0.62), new Phaser.Geom.Point(point.x + size, point.y),
        new Phaser.Geom.Point(point.x, point.y + size * 0.62), new Phaser.Geom.Point(point.x - size, point.y),
      ];
      graphics.fillStyle(color, 1).fillPoints(diamond, true);
      graphics.lineStyle(2, 0xd4dde2, node.available ? 0.95 : 0.25).strokePoints(diamond, true);
      graphics.lineStyle(1, 0x0b1015, 0.65).strokeEllipse(point.x, point.y + size * 0.78, size * 1.6, size * 0.45);
    }
    this.layer?.add(graphics);
  }

  private dashedLine(graphics: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, color: number, alpha: number): void {
    const distance = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const segments = Math.max(1, Math.floor(distance / 14));
    graphics.lineStyle(2, color, alpha);
    for (let index = 0; index < segments; index += 2) {
      const start = index / segments;
      const end = Math.min(1, (index + 1) / segments);
      graphics.lineBetween(Phaser.Math.Linear(x1, x2, start), Phaser.Math.Linear(y1, y2, start), Phaser.Math.Linear(x1, x2, end), Phaser.Math.Linear(y1, y2, end));
    }
  }

  private renderCombat(width: number, height: number): void {
    const combat = this.snapshot.run!.combat!;
    const graphics = this.add.graphics();
    const floorY = height * 0.61;
    graphics.lineStyle(2, 0x344255, 0.8).lineBetween(width * 0.1, floorY + 75, width * 0.9, floorY + 75);
    const character = this.content.characters.get(combat.player.characterId);
    this.drawActor(graphics, width * 0.2, floorY, 0x568078, combat.player.health, combat.player.maxHealth, character ? this.content.text(character.nameKey) : 'PLAYER');
    combat.enemies.forEach((enemy, index) => {
      const definition = this.content.enemies.get(enemy.definitionId)!;
      const x = width * (0.68 + index * 0.13);
      this.drawActor(graphics, x, floorY, enemy.health > 0 ? 0xb56576 : 0x303640, enemy.health, definition.maxHealth, `TARGET ${index + 1}`);
      const intent = definition.intents[enemy.intentIndex % definition.intents.length];
      const label = this.add.text(x, floorY - 112, this.content.text(intent.nameKey), {
        color: '#d6dde8', fontFamily: 'system-ui, sans-serif', fontSize: '13px', align: 'center',
      }).setOrigin(0.5);
      this.layer?.add(label);
    });
    this.layer?.add(graphics);
  }

  private drawActor(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    color: number,
    health: number,
    maxHealth: number,
    label: string,
  ): void {
    graphics.fillStyle(color, 1).fillRoundedRect(x - 55, y - 70, 110, 140, 12);
    graphics.lineStyle(3, 0xd6dde8, 0.5).strokeRoundedRect(x - 55, y - 70, 110, 140, 12);
    graphics.fillStyle(0x171c24, 1).fillRoundedRect(x - 55, y + 82, 110, 10, 5);
    graphics.fillStyle(0x65c48d, 1).fillRoundedRect(x - 55, y + 82, 110 * Math.max(0, health / maxHealth), 10, 5);
    const text = this.add.text(x, y + 103, `${label}  ${health}/${maxHealth}`, {
      color: '#c7d1dc', fontFamily: 'monospace', fontSize: '13px',
    }).setOrigin(0.5);
    this.layer?.add(text);
  }

  private playEvents(events: readonly DomainEvent[]): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true') return;
    if (events.some((event) => event.type === 'effect.damage')) this.cameras.main.shake(90, 0.0025);
    if (events.some((event) => event.type === 'combat.won' || event.type === 'run.completed')) {
      this.cameras.main.flash(220, 170, 210, 190, false);
    }
  }
}
