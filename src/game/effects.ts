import type { EffectHandler, EffectOperation } from './types';

function numberParam(params: Readonly<Record<string, unknown>>, key: string): number {
  const value = params[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Effect parameter "${key}" must be a finite number.`);
  }
  return value;
}

function stringParam(params: Readonly<Record<string, unknown>>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Effect parameter "${key}" must be a non-empty string.`);
  }
  return value;
}

export class EffectRegistry {
  private readonly handlers = new Map<string, EffectHandler>();

  register(id: string, handler: EffectHandler): this {
    if (this.handlers.has(id)) throw new Error(`Effect handler already registered: ${id}`);
    this.handlers.set(id, handler);
    return this;
  }

  has(id: string): boolean {
    return this.handlers.has(id);
  }

  get(id: string): EffectHandler {
    const handler = this.handlers.get(id);
    if (!handler) throw new Error(`Effect handler is not registered: ${id}`);
    return handler;
  }
}

export function createCoreEffectRegistry(): EffectRegistry {
  const operation = (value: EffectOperation): EffectOperation[] => [value];
  return new EffectRegistry()
    .register('core.damage', (context, params) => operation({
      type: 'damage',
      target: context.target ?? 'player',
      amount: numberParam(params, 'amount'),
    }))
    .register('core.block', (context, params) => operation({
      type: 'block',
      target: context.target ?? context.source,
      amount: numberParam(params, 'amount'),
    }))
    .register('core.blockSource', (context, params) => operation({
      type: 'block',
      target: context.source,
      amount: numberParam(params, 'amount'),
    }))
    .register('core.draw', (_context, params) => operation({
      type: 'draw',
      amount: numberParam(params, 'amount'),
    }))
    .register('core.gainResource', (context, params) => operation({
      type: 'gainResource',
      resourceId: stringParam(params, 'resourceId'),
      amount: numberParam(params, 'amount') * (params.perStack === true ? (context.stacks ?? 1) : 1),
    }))
    .register('core.heal', (context, params) => operation({
      type: 'heal',
      target: context.target ?? context.source,
      amount: numberParam(params, 'amount'),
    }))
    .register('core.gainGold', (_context, params) => operation({
      type: 'gainGold',
      amount: numberParam(params, 'amount'),
    }))
    .register('core.addStatus', (context, params) => operation({
      type: 'addStatus',
      target: context.target ?? context.source,
      statusId: stringParam(params, 'statusId'),
      stacks: numberParam(params, 'stacks'),
      duration: params.durationFromStacks === true ? numberParam(params, 'stacks') : undefined,
    }))
    .register('core.healPercent', (context, params) => operation({
      type: 'healPercent',
      target: context.target ?? context.source,
      percent: numberParam(params, 'percent'),
    }))
    .register('core.gainCollectible', (_context, params) => operation({
      type: 'gainCollectible',
      collectibleId: stringParam(params, 'collectibleId'),
    }))
    .register('core.gainRandomCollectible', () => operation({ type: 'gainRandomCollectible' }))
    .register('core.addRunStatus', (_context, params) => operation({
      type: 'addRunStatus',
      statusId: stringParam(params, 'statusId'),
      stacks: numberParam(params, 'stacks'),
    }))
    .register('core.upgradeRandomCards', (_context, params) => operation({
      type: 'upgradeRandomCards',
      cardTag: stringParam(params, 'cardTag'),
      count: numberParam(params, 'count'),
    }))
    .register('core.multiplyGoldRandom', (_context, params) => operation({
      type: 'multiplyGoldRandom',
      upMultiplier: numberParam(params, 'upMultiplier'),
      downMultiplier: numberParam(params, 'downMultiplier'),
      upChance: numberParam(params, 'upChance'),
    }));
}
