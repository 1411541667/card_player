# Roguelike Card Framework

A browser roguelike deckbuilder framework plus the first playable post-apocalyptic content pack.
Phaser renders the isometric route and combat field, Preact owns text-heavy UI, and a serializable
TypeScript kernel owns all rules.

The active `src/content/wasteland` pack contains the Scavenger, a character/boon/theme setup flow,
four floors, four bosses, events, rewards, collectibles, JSON runtime tables, and matching human-editable CSV tables. Content remains
separate from the engine and can still be replaced without editing the kernel.

## Commands

```bash
npm install
npm run dev
npm run build
npm test
npm run lint
npm run test:e2e
npm run content:check
npm run content:sync
```

The main menu includes settings, encounter-unlocked encyclopedia entries, and the last three run
records. Use the backtick key or the **开发面板** button to inspect state, set fixture resources, jump to
nodes, view domain events, and import or export a `RunSaveV2` document.

## Architecture

- `src/game`: deterministic simulation, commands, events, content validation, RNG, node/effect registries, and saves.
- `src/phaser`: disposable rendering objects and the simulation-to-scene bridge.
- `src/ui`: Preact DOM overlays, input feedback, responsive layout, and debug tooling.
- `src/content/wasteland/data`: generated/validated JSON definitions loaded by the game.
- `src/content/wasteland/tables`: human-editable CSV sources for cards, characters, enemies, bosses, events, rewards, and collectibles.
- `scripts/sync-content.mjs`: synchronizes editable CSV values into runtime JSON and detects drift.

The UI sends `GameCommand` objects to `GameKernel`. The kernel validates and applies each command
atomically, emits `DomainEvent` records, and publishes a cloned `GameSnapshot`. Rendering code never
owns or mutates simulation state.

See [docs/wasteland-v1.md](docs/wasteland-v1.md) for the implemented design and
[docs/content-authoring.md](docs/content-authoring.md) for extension instructions.
