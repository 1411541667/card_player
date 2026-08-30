import type { RandomState } from './types';

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function sample(value: number): number {
  let current = value + 0x6d2b79f5;
  current = Math.imul(current ^ (current >>> 15), current | 1);
  current ^= current + Math.imul(current ^ (current >>> 7), current | 61);
  return ((current ^ (current >>> 14)) >>> 0) / 4294967296;
}

export class NamespacedRandom {
  private state: RandomState;

  constructor(seedOrState: string | RandomState) {
    this.state = typeof seedOrState === 'string'
      ? { seed: seedOrState, counters: {} }
      : structuredClone(seedOrState);
  }

  next(namespace: string): number {
    const counter = this.state.counters[namespace] ?? 0;
    this.state.counters[namespace] = counter + 1;
    return sample(hash(`${this.state.seed}:${namespace}:${counter}`));
  }

  integer(namespace: string, minimum: number, maximum: number): number {
    if (maximum < minimum) throw new Error('Random integer maximum must be >= minimum.');
    return minimum + Math.floor(this.next(namespace) * (maximum - minimum + 1));
  }

  pick<T>(namespace: string, values: readonly T[]): T {
    if (values.length === 0) throw new Error(`Cannot pick from an empty collection: ${namespace}`);
    return values[this.integer(namespace, 0, values.length - 1)];
  }

  shuffle<T>(namespace: string, values: readonly T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.integer(namespace, 0, index);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  exportState(): RandomState {
    return structuredClone(this.state);
  }
}
