import { describe, expect, it } from 'vitest';
import { ContentRegistry } from '../../src/game/content';
import { wastelandContentPack } from '../../src/content/wasteland';
import { createCoreEffectRegistry } from '../../src/game/effects';

describe('Wasteland ContentRegistry', () => {
  it('accepts the production content pack and all four bosses', () => {
    const registry = new ContentRegistry(wastelandContentPack, createCoreEffectRegistry());
    expect(registry.pack.id).toBe('wasteland-first-run');
    expect(registry.pack.encounters.filter((item) => item.category === 'boss')).toHaveLength(4);
    expect(registry.pack.enemies.find((item) => item.id === 'boss.angel-question')).toBeDefined();
  });

  it('rejects duplicate ids', () => {
    const pack = structuredClone(wastelandContentPack);
    pack.cards.push(structuredClone(pack.cards[0]));
    expect(() => new ContentRegistry(pack, createCoreEffectRegistry())).toThrow(/Duplicate card id/);
  });

  it('rejects unregistered effects before runtime', () => {
    const pack = structuredClone(wastelandContentPack);
    pack.cards[0].effects[0].effectId = 'missing.effect';
    expect(() => new ContentRegistry(pack, createCoreEffectRegistry())).toThrow(/Unregistered effect/);
  });

  it('rejects dangling reward references', () => {
    const pack = structuredClone(wastelandContentPack);
    pack.encounters[0].rewardPool = ['missing.reward'];
    expect(() => new ContentRegistry(pack, createCoreEffectRegistry())).toThrow(/Unknown reward/);
  });
});
