import { describe, expect, it } from 'vitest';
import { NamespacedRandom } from '../../src/game/random';

describe('NamespacedRandom', () => {
  it('isolates counters by namespace', () => {
    const first = new NamespacedRandom('seed');
    const second = new NamespacedRandom('seed');
    first.next('map');
    expect(first.next('reward')).toBe(second.next('reward'));
  });

  it('continues exactly from exported state', () => {
    const source = new NamespacedRandom('seed');
    source.next('combat');
    const restored = new NamespacedRandom(source.exportState());
    expect(restored.next('combat')).toBe(source.next('combat'));
  });
});
