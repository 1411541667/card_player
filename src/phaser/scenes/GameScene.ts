import Phaser from 'phaser';
import type { ContentRegistry } from '../../game/content';
import type { DomainEvent, GameSnapshot, MapNodeState } from '../../game/types';
import type { SceneBridge } from '../adapters/sceneBridge';
import combatSvg from '../../content/wasteland/assets/icon_map/combat.svg?raw';
import eliteSvg from '../../content/wasteland/assets/icon_map/elite.svg?raw';
import shopSvg from '../../content/wasteland/assets/icon_map/shop.svg?raw';
import eventSvg from '../../content/wasteland/assets/icon_map/event.svg?raw';
import rewardSvg from '../../content/wasteland/assets/icon_map/reward.svg?raw';
import restSvg from '../../content/wasteland/assets/icon_map/rest.svg?raw';
import bossSvg from '../../content/wasteland/assets/icon_map/boss.svg?raw';

const mapIconSvg: Record<string, string> = {
  'map.combat': combatSvg,
  'map.elite': eliteSvg,
  'map.shop': shopSvg,
  'map.event': eventSvg,
  'map.reward': rewardSvg,
  'map.rest': restSvg,
  'map.boss': bossSvg,
};

/**
 * Vite inlines small assets as URL-encoded data URIs (`data:image/svg+xml,%3csvg...`),
 * which Phaser's loader treats as base64 and feeds to `atob()` — that throws, so the
 * texture never registers and map icons silently vanish in packaged builds. Loading the
 * raw SVG source instead and handing Phaser a proper base64 data URI avoids the bug
 * entirely and works identically in dev, build, and the portable launcher.
 */
function svgToBase64DataUri(source: string): string {
  let ascii = true;
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) > 0x7f) { ascii = false; break; }
  }
  const binary = ascii
    ? source
    : Array.from(new TextEncoder().encode(source), (byte) => String.fromCharCode(byte)).join('');
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

const MAP_LAYER_SPACING = 150;

function mapSideMargin(viewportWidth: number): number {
  return Math.max(96, Math.round(viewportWidth / 6));
}

function mapWorldWidth(maxLayer: number, viewportWidth: number): number {
  if (maxLayer <= 2) return viewportWidth;
  const contentWidth = Math.max(maxLayer * MAP_LAYER_SPACING, Math.round(viewportWidth * 0.66));
  return mapSideMargin(viewportWidth) * 2 + contentWidth;
}

function nodeJitter(id: string, axis: number): number {
  let hash = axis * 97;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return ((Math.abs(hash) % 200) / 100 - 1);
}

export class GameScene extends Phaser.Scene {
  private layer?: Phaser.GameObjects.Container;
  private snapshot: GameSnapshot = { phase: 'menu', revision: 0 };
  private unsubscribe?: () => void;
  private mapDragging = false;
  private mapDragStartX = 0;
  private mapDragScrollX = 0;
  private mapDragMoved = false;
  private lastDrawingPoint?: { x: number; y: number };
  private lastDrawingCell?: string;

  constructor(private readonly bridge: SceneBridge, private readonly content: ContentRegistry) {
    super({ key: 'GameScene' });
  }

  preload(): void {
    for (const [key, source] of Object.entries(mapIconSvg)) {
      const keys = key === 'map.boss' ? ['map.boss-1', 'map.boss-2', 'map.boss-3', 'map.boss-4'] : [key];
      for (const textureKey of keys) {
        this.load.svg({ key: textureKey, url: svgToBase64DataUri(source), svgConfig: { width: 64, height: 64 } });
      }
    }
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
    this.game.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.unsubscribe = this.bridge.subscribe((snapshot, events) => {
      this.snapshot = snapshot;
      this.renderSnapshot();
      this.playEvents(events);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.renderSnapshot, this);
    this.input.on('wheel', (_pointer: unknown, _over: unknown, dx: number, dy: number) => {
      if (this.snapshot.phase !== 'map' || !this.snapshot.run) return;
      const maxLayer = Math.max(...this.snapshot.run.map.nodes.map((node) => node.layer), 1);
      const maxScroll = Math.max(0, mapWorldWidth(maxLayer, this.scale.width) - this.scale.width);
      this.cameras.main.scrollX = Phaser.Math.Clamp(this.cameras.main.scrollX + (dx || dy), 0, maxScroll);
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (this.snapshot.phase !== 'map') return;
      if (pointer.button === 2) {
        this.mapDragging = false;
        this.lastDrawingPoint = undefined; this.lastDrawingCell = undefined; this.drawAt(pointer);
        return;
      }
      if (this.bridge.getMapTool() === 'erase') {
        this.mapDragging = false;
        this.lastDrawingPoint = undefined; this.lastDrawingCell = undefined;
        this.eraseAt(pointer);
        return;
      }
      this.mapDragging = true; this.mapDragMoved = false; this.mapDragStartX = pointer.x; this.mapDragScrollX = this.cameras.main.scrollX;
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.snapshot.phase !== 'map' || !this.snapshot.run) return;
      if (pointer.isDown && pointer.rightButtonDown()) { this.drawAt(pointer); return; }
      if (pointer.isDown && this.bridge.getMapTool() === 'erase') { this.eraseAt(pointer); return; }
      if (!this.mapDragging || !pointer.isDown) return;
      if (Math.abs(pointer.x - this.mapDragStartX) > 8) this.mapDragMoved = true;
      const maxLayer = Math.max(...this.snapshot.run.map.nodes.map((node) => node.layer), 1);
      this.cameras.main.scrollX = Phaser.Math.Clamp(this.mapDragScrollX - (pointer.x - this.mapDragStartX), 0, Math.max(0, mapWorldWidth(maxLayer, this.scale.width) - this.scale.width));
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => { this.mapDragging = false; this.lastDrawingPoint = undefined; this.lastDrawingCell = undefined; });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
  }

  private drawAt(pointer: Phaser.Input.Pointer): void {
    const run = this.snapshot.run;
    if (!run) return;
    const x = pointer.worldX; const y = pointer.worldY;
    const from = this.lastDrawingPoint ?? { x, y };
    const distance = Phaser.Math.Distance.Between(from.x, from.y, x, y);
    const steps = Math.max(1, Math.ceil(distance / 2));
    for (let index = 1; index <= steps; index += 1) {
      const px = Phaser.Math.Linear(from.x, x, index / steps);
      const py = Phaser.Math.Linear(from.y, y, index / steps);
      const cell = `${Math.round(px / 3) * 3},${Math.round(py / 3) * 3}`;
      if (cell === this.lastDrawingCell) continue;
      if (this.lastDrawingCell) {
        const [previousX, previousY] = this.lastDrawingCell.split(',').map(Number);
        const [currentX, currentY] = cell.split(',').map(Number);
        if (previousX !== currentX && previousY !== currentY) {
          this.bridge.dispatch({ type: 'DRAW_MAP', x: currentX, y: previousY, color: run.player.characterId === 'character.hunter' ? 'blue' : 'red' });
          this.bridge.dispatch({ type: 'DRAW_MAP', x: previousX, y: currentY, color: run.player.characterId === 'character.hunter' ? 'blue' : 'red' });
        }
      }
      this.lastDrawingCell = cell;
      this.bridge.dispatch({ type: 'DRAW_MAP', x: px, y: py, color: run.player.characterId === 'character.hunter' ? 'blue' : 'red' });
    }
    this.lastDrawingPoint = { x, y };
  }

  private eraseAt(pointer: Phaser.Input.Pointer): void {
    this.bridge.dispatch({ type: 'ERASE_MAP', x: pointer.worldX, y: pointer.worldY });
  }

  private renderSnapshot(): void {
    this.layer?.destroy(true);
    this.layer = this.add.container(0, 0);
    const width = this.scale.width;
    const height = this.scale.height;
    let worldWidth = width;
    if (this.snapshot.phase === 'map' && this.snapshot.run) {
      const maxLayer = Math.max(...this.snapshot.run.map.nodes.map((node) => node.layer), 1);
      worldWidth = Math.max(width, mapWorldWidth(maxLayer, width));
    } else {
      this.cameras.main.scrollX = 0;
    }
    const background = this.add.graphics();
    background.fillGradientStyle(0x101620, 0x101620, 0x080b10, 0x080b10, 1);
    background.fillRect(0, 0, worldWidth, height);
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
    const sideMargin = mapSideMargin(width);
    const worldWidth = mapWorldWidth(maxLayer, width);
    const compact = map.nodes.length === 3 && maxLayer === 2;
    const pad = 28;
    const contentWidth = compact ? Math.min(560, Math.round(width * 0.55)) : worldWidth - sideMargin * 2;
    const layoutMargin = compact ? Math.round((width - contentWidth) / 2) : sideMargin;
    const regularContentHeight = Math.min(900, Math.round(height * 0.72));
    const mapTop = Math.round((height - regularContentHeight) / 2);
    const panelHeight = compact ? Math.min(320, Math.round(height * 0.38)) : regularContentHeight + pad * 2;
    const maxScroll = Math.max(0, worldWidth - width);
    this.cameras.main.scrollX = Phaser.Math.Clamp(this.cameras.main.scrollX, 0, maxScroll);
    const position = (node: { layer: number; column: number }) => ({
      x: layoutMargin + (node.layer / Math.max(1, maxLayer)) * contentWidth + (compact ? 0 : nodeJitter((node as MapNodeState).id, 1) * 14),
      y: compact ? height / 2 : mapTop + (node.column / Math.max(1, maxColumn)) * regularContentHeight + nodeJitter((node as MapNodeState).id, 2) * 10,
    });

    // Brown panel that holds the node map, so markers stand out against the dark backdrop.
    const panelX = layoutMargin - pad;
    const panelY = compact ? Math.round((height - panelHeight) / 2) : mapTop - pad;
    const panelWidth = contentWidth + pad * 2;
    const panel = this.add.graphics();
    panel.fillGradientStyle(0x765536, 0x65472f, 0x4d3525, 0x5b3f29, 1).fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 18);
    panel.fillStyle(0x543a24, 0.88).fillRoundedRect(panelX, panelY + panelHeight - 34, panelWidth, 34, 18);
    panel.lineStyle(2, 0xcaa46a, 0.9).strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 18);
    panel.lineStyle(1, 0x2a1d10, 0.9).strokeRoundedRect(panelX + 3, panelY + 3, panelWidth - 6, panelHeight - 6, 16);
    this.layer?.add(panel);

    // Subtle paper grain and contour lines give the route a hand-drawn map feel.
    const terrain = this.add.graphics();
    for (let index = 0; index < 72; index += 1) {
      const tx = panelX + 18 + ((index * 137) % Math.max(1, panelWidth - 36));
      const ty = panelY + 20 + ((index * 83) % Math.max(1, panelHeight - 52));
      terrain.fillStyle(index % 2 === 0 ? 0xd4ad78 : 0x2b1d14, 0.07).fillCircle(tx, ty, 1 + (index % 3));
    }
    for (let line = 0; line < 7; line += 1) {
      const baseY = panelY + 50 + line * Math.max(32, panelHeight / 9);
      terrain.lineStyle(1, 0xd3ae7a, 0.1);
      const points: Array<{ x: number; y: number }> = [];
      for (let step = 0; step <= 12; step += 1) {
        const px = panelX + 12 + (step / 12) * Math.max(1, panelWidth - 24);
        points.push({ x: px, y: baseY + Math.sin(step * 1.3 + line) * 8 + Math.cos(step * .55) * 3 });
      }
      for (let step = 1; step < points.length; step += 1) terrain.lineBetween(points[step - 1].x, points[step - 1].y, points[step].x, points[step].y);
    }
    this.layer?.add(terrain);

    const graphics = this.add.graphics();
    for (const node of map.nodes) {
      const from = position(node);
      for (const connectionId of node.connections) {
        const target = map.nodes.find((candidate) => candidate.id === connectionId);
        if (target) {
          const to = position(target);
          this.dashedCurve(graphics, from.x, from.y, to.x, to.y, nodeJitter(node.id, 3) * 24, 0x9c8a6b, node.visited ? 0.85 : 0.55);
        }
      }
    }

    const palette: Record<string, number> = { 'core.combat': 0xb64d48, 'core.elite': 0x8a5bbd, 'core.boss': 0xd1a45b, 'core.shop': 0x3d85c9, 'core.event': 0xd2a72b, 'core.reward': 0x54a366, 'core.rest': 0x66707d };
    for (const node of map.nodes) {
      const point = position(node);
      const baseColor = palette[node.handlerId] ?? 0x70b8ff;
      const size = node.handlerId === 'core.boss' ? 48 : 38;
      const radius = size / 2;
      const dimmed = node.visited ? 0.62 : 0.5;

      // Base marker: always drawn, so every node stays visible even if a texture is missing.
      graphics.fillStyle(0x17100b, 0.35).fillCircle(point.x + 3, point.y + 4, radius + 5);
      graphics.fillStyle(baseColor, node.available ? 0.95 : dimmed).fillCircle(point.x, point.y, radius + 4);
      graphics.lineStyle(2, 0x14100a, 0.9).strokeCircle(point.x, point.y, radius + 4);
      if (node.available && !node.visited) {
        graphics.lineStyle(3, 0xffe9b8, 1).strokeCircle(point.x, point.y, radius + 10);
      }
    }
    this.layer?.add(graphics);

    for (const node of map.nodes) {
      const point = position(node);
      const size = node.handlerId === 'core.boss' ? 48 : 38;
      const radius = size / 2;
      const iconAlpha = node.visited ? 0.62 : node.available ? 1 : 0.5;
      const iconKey = node.iconKey ?? ({ 'core.combat': 'map.combat', 'core.elite': 'map.elite', 'core.shop': 'map.shop', 'core.event': 'map.event', 'core.reward': 'map.reward', 'core.boss': `map.boss-${this.snapshot.run!.floor}` } as Record<string, string>)[node.handlerId];

      if (iconKey && this.textures.exists(iconKey)) {
        const icon = this.add.image(point.x, point.y, iconKey).setDisplaySize(size, size);
        icon.setAlpha(iconAlpha);
        this.layer?.add(icon);
      }

      // Hit area: guaranteed clickable whether or not the SVG texture loaded.
      const zone = this.add.zone(point.x, point.y, radius * 2 + 16, radius * 2 + 16);
      if (node.available && !node.visited) {
        zone.setInteractive({ useHandCursor: true });
        zone.on(Phaser.Input.Events.POINTER_UP, () => { if (!this.mapDragMoved) this.bridge.dispatch({ type: 'ENTER_NODE', nodeId: node.id }); });
      }
      this.layer?.add(zone);
    }

    // Draw annotations last so player markings remain visible above node icons and hit areas.
    const drawingGraphics = this.add.graphics();
    for (const [key, color] of Object.entries(map.drawings ?? {})) {
      const [x, y] = key.split(',').map(Number);
      drawingGraphics.fillStyle(color === 'blue' ? 0x4d91e8 : 0xe35a55, 0.95).fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    this.layer?.add(drawingGraphics);
  }

  private dashedCurve(graphics: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, bend: number, color: number, alpha: number): void {
    const midX = (x1 + x2) / 2; const midY = (y1 + y2) / 2;
    const dx = x2 - x1; const dy = y2 - y1; const length = Math.max(1, Math.hypot(dx, dy));
    const controlX = midX - (dy / length) * bend; const controlY = midY + (dx / length) * bend;
    const steps = Math.max(8, Math.floor(length / 10));
    graphics.lineStyle(2, color, alpha);
    for (let index = 0; index < steps; index += 2) {
      const a0 = index / steps; const a1 = Math.min(1, (index + 1) / steps);
      const point = (t: number) => ({ x: (1 - t) ** 2 * x1 + 2 * (1 - t) * t * controlX + t ** 2 * x2, y: (1 - t) ** 2 * y1 + 2 * (1 - t) * t * controlY + t ** 2 * y2 });
      const p0 = point(a0); const p1 = point(a1); graphics.lineBetween(p0.x, p0.y, p1.x, p1.y);
    }
  }

  private renderCombat(width: number, height: number): void {
    const combat = this.snapshot.run!.combat!;
    const graphics = this.add.graphics();
    const floorY = height * 0.61;
    graphics.lineStyle(2, 0x344255, 0.8).lineBetween(width * 0.1, floorY + 75, width * 0.9, floorY + 75);
    const character = this.content.characters.get(combat.player.characterId);
    const playerX = width * 0.2;
    this.actorPositions.set('player', { x: playerX, y: floorY });
    this.drawActor(graphics, playerX, floorY, 0x568078, combat.player.health, combat.player.maxHealth, combat.player.block, character ? this.content.text(character.nameKey) : 'PLAYER', 110);
    const enemyCount = combat.enemies.length;
    combat.enemies.forEach((enemy, index) => {
      const definition = this.content.enemies.get(enemy.definitionId)!;
      const x = enemyCount === 1
        ? width * 0.68
        : width * (0.58 + (index / Math.max(1, enemyCount - 1)) * 0.3);
      const boxWidth = enemyCount >= 3 ? 86 : 110;
      this.actorPositions.set(enemy.instanceId, { x, y: floorY });
      this.drawActor(graphics, x, floorY, enemy.health > 0 ? 0xb56576 : 0x303640, enemy.health, definition.maxHealth, enemy.block, `TARGET ${index + 1}`, boxWidth);
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
    block: number,
    label: string,
    boxWidth = 110,
  ): void {
    const half = boxWidth / 2;
    graphics.fillStyle(color, 1).fillRoundedRect(x - half, y - 70, boxWidth, 140, 12);
    graphics.lineStyle(3, 0xd6dde8, 0.5).strokeRoundedRect(x - half, y - 70, boxWidth, 140, 12);
    // HP bar (green), followed by the block bar (blue) when the actor has 防护.
    graphics.fillStyle(0x171c24, 1).fillRoundedRect(x - half, y + 82, boxWidth, 10, 5);
    const healthFraction = Math.max(0, health / maxHealth);
    graphics.fillStyle(0x65c48d, 1).fillRoundedRect(x - half, y + 82, boxWidth * healthFraction, 10, 5);
    if (block > 0) {
      const blockFraction = Math.min(1, Math.max(healthFraction, (health + block) / maxHealth));
      graphics.fillStyle(0x5f9fd6, 1).fillRoundedRect(x - half + boxWidth * healthFraction, y + 82, boxWidth * (blockFraction - healthFraction), 10, 5);
    }
    const text = this.add.text(x, y + 103, `${label}  ${health}/${maxHealth}${block > 0 ? `  防护 ${block}` : ''}`, {
      color: '#c7d1dc', fontFamily: 'monospace', fontSize: '13px',
    }).setOrigin(0.5);
    this.layer?.add(text);
  }

  private actorPositions = new Map<string, { x: number; y: number }>();

  private actorPosition(target: string | undefined): { x: number; y: number } | undefined {
    if (!target) return undefined;
    return this.actorPositions.get(target);
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const label = this.add.text(x, y, text, {
      fontFamily: '"Cascadia Code", Consolas, monospace', fontSize: '22px', fontStyle: 'bold',
      color, stroke: '#0a0d12', strokeThickness: 5,
    }).setOrigin(0.5);
    this.layer?.add(label);
    this.tweens.add({
      targets: label, y: y - 48, alpha: 0, duration: 780, ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private hitFlash(x: number, y: number, color: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(color, 0.5).fillRoundedRect(x - 55, y - 70, 110, 140, 12);
    graphics.lineStyle(3, 0xffffff, 0.85).strokeRoundedRect(x - 55, y - 70, 110, 140, 12);
    this.layer?.add(graphics);
    this.tweens.add({
      targets: graphics, alpha: 0, duration: 280, ease: 'Quad.easeOut',
      onComplete: () => graphics.destroy(),
    });
  }

  private playEvents(events: readonly DomainEvent[]): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true') return;
    for (const event of events) {
      if (event.type === 'effect.damage') {
        const target = event.payload.target as string | undefined;
        const amount = Number(event.payload.amount ?? 0);
        const absorbed = Number(event.payload.absorbed ?? 0);
        const dealt = Math.max(0, amount - absorbed);
        const pos = this.actorPosition(target);
        if (pos && dealt > 0) {
          this.hitFlash(pos.x, pos.y, 0xd8504a);
          if (target === 'player') this.cameras.main.shake(90, 0.0025);
          this.floatText(pos.x, pos.y - 74, `-${dealt}`, '#ff6b62');
        }
      } else if (event.type === 'effect.block') {
        const pos = this.actorPosition(event.payload.target as string | undefined);
        if (pos) this.floatText(pos.x, pos.y - 74, `+${Number(event.payload.amount ?? 0)}`, '#6fa8ff');
      } else if (event.type === 'effect.heal') {
        const pos = this.actorPosition(event.payload.target as string | undefined);
        if (pos) this.floatText(pos.x, pos.y - 74, `+${Number(event.payload.amount ?? 0)}`, '#7fd98a');
      }
    }
    if (events.some((event) => event.type === 'combat.won' || event.type === 'run.completed')) {
      this.cameras.main.flash(220, 170, 210, 190, false);
    }
  }
}
