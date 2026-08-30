# Content pack authoring

## 1. Create a pack

Copy the shape of `src/content/wasteland` into a new folder under `src/content`. A pack declares every gameplay value:
starting deck, resources, turn policies, map dimensions and distributions, card costs, enemy health,
rewards, and repeatable shop services. The engine intentionally supplies no balance defaults.

For the wasteland pack, edit the human-facing CSV tables first. Run `npm run content:sync` to update
the supported runtime JSON values, then run `npm run content:check`. Build and test commands also run
the drift check automatically.

Select the pack in `src/main.tsx` and pass it to `ContentRegistry`. Startup validation rejects:

- duplicate identifiers;
- missing localization keys;
- unknown cards, enemies, encounters, events, or resources;
- unknown node and effect handlers;
- invalid field types and missing final-node definitions.

## 2. Reuse or add effects

Core handlers are registered by `createCoreEffectRegistry()` and include damage, block, draw,
resource changes, healing, currency, and statuses. JSON refers to them by `effectId` and provides
parameters.

For a custom mechanic, register a namespaced handler before constructing `ContentRegistry`:

```ts
effects.register('my-pack.echo', (context, params) => {
  // Read context.snapshot; return controlled operations. Do not mutate state or UI.
  return [{ type: 'draw', amount: Number(params.amount) }];
});
```

Handlers receive a read-only snapshot, source, target, optional status stacks, and namespaced random
access. They return `EffectOperation[]`; only `GameKernel` applies operations.

## 3. Add node types

Built-in handler IDs are `core.combat`, `core.elite`, `core.boss`, `core.shop`, `core.event`, and
`core.reward`. Additional handlers can be registered in `NodeHandlerRegistry`. A handler resolves a
map node into a supported flow without accessing Phaser or DOM objects.

## 4. Replace presentation

Assets are referenced by stable manifest keys from the selected pack. CSS theme values live in
`src/ui/styles.css`; replace variables or load a separate theme sheet without changing simulation
code. Phaser scenes subscribe only to `SceneBridge`, so sprites and effects can be replaced without
changing saves or rules.

## 5. Save compatibility

`RunSaveV2` records the content pack ID/version, simulation state, and namespaced RNG counters.
Increment the content pack version when definitions become incompatible. Add future schema migration
steps beside `BrowserSaveStore`; never serialize Phaser, Preact, DOM, audio, or tween objects.
