import type { GameCommand, GameSnapshot } from '../types';
import type { InputBindings } from '../settings';

export function commandForKey(event: KeyboardEvent, snapshot: GameSnapshot, bindings: InputBindings): GameCommand | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return undefined;
  if (snapshot.phase !== 'combat' || !snapshot.run?.combat) return undefined;
  const key = event.key.toLowerCase();
  if (key === bindings.endTurn.toLowerCase()) return { type: 'END_TURN' };
  const index = bindings.hand.findIndex((binding) => binding.toLowerCase() === key);
  if (index < 0) return undefined;
  const card = snapshot.run.combat.hand[index];
  if (!card) return undefined;
  const firstEnemy = snapshot.run.combat.enemies.find((enemy) => enemy.health > 0);
  return { type: 'PLAY_CARD', cardInstanceId: card.instanceId, targetId: firstEnemy?.instanceId };
}
