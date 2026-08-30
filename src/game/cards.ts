import type { CardDefinition, CardInstance, EffectInvocation } from './types';

export function maxUpgradeLevel(definition: CardDefinition): number {
  return definition.upgrades?.length ?? 0;
}

export function cardCost(definition: CardDefinition, instance: CardInstance): CardDefinition['cost'] {
  const upgrade = instance.upgradeLevel > 0 ? definition.upgrades?.[instance.upgradeLevel - 1] : undefined;
  return upgrade?.cost ?? definition.cost;
}

export function cardEffects(definition: CardDefinition, instance: CardInstance): readonly EffectInvocation[] {
  const upgrade = instance.upgradeLevel > 0 ? definition.upgrades?.[instance.upgradeLevel - 1] : undefined;
  return upgrade?.effects ?? definition.effects;
}

export function cardDescriptionKey(definition: CardDefinition, instance?: CardInstance): string {
  if (!instance || instance.upgradeLevel <= 0) return definition.descriptionKey;
  return definition.upgrades?.[instance.upgradeLevel - 1]?.descriptionKey ?? definition.descriptionKey;
}
