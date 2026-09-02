import type { ContentRegistry } from './content';
import type { MapNodeState, NodeDefinition } from './types';
import type { NamespacedRandom } from './random';

export type NodeResolution =
  | { type: 'combat'; encounterId: string }
  | { type: 'shop' }
  | { type: 'event'; eventId: string }
  | { type: 'reward'; rewardIds: string[] }
  | { type: 'rest' };

export interface NodeHandlerContext {
  node: Readonly<MapNodeState>;
  definition: Readonly<NodeDefinition>;
  content: ContentRegistry;
  random: NamespacedRandom;
}

export type NodeHandler = (context: NodeHandlerContext) => NodeResolution;

export class NodeHandlerRegistry {
  private readonly handlers = new Map<string, NodeHandler>();

  register(id: string, handler: NodeHandler): this {
    if (this.handlers.has(id)) throw new Error(`Node handler already registered: ${id}`);
    this.handlers.set(id, handler);
    return this;
  }

  has(id: string): boolean {
    return this.handlers.has(id);
  }

  resolve(id: string, context: NodeHandlerContext): NodeResolution {
    const handler = this.handlers.get(id);
    if (!handler) throw new Error(`Node handler is not registered: ${id}`);
    return handler(context);
  }
}

function encounter(context: NodeHandlerContext): NodeResolution {
  const pool = context.definition.encounterPool ?? [];
  return { type: 'combat', encounterId: context.random.pick(`node:${context.node.id}:encounter`, pool) };
}

export function createCoreNodeHandlers(): NodeHandlerRegistry {
  return new NodeHandlerRegistry()
    .register('core.combat', encounter)
    .register('core.elite', encounter)
    .register('core.boss', encounter)
    .register('core.shop', () => ({ type: 'shop' }))
    .register('core.reward', (context) => ({
      type: 'reward',
      rewardIds: context.random.shuffle(`node:${context.node.id}:reward`, context.definition.rewardPool ?? []),
    }))
    .register('core.event', (context) => ({
      type: 'event',
      eventId: context.random.pick(`node:${context.node.id}:event`, context.definition.eventPool ?? []),
    }))
    .register('core.rest', () => ({ type: 'rest' }));
}
