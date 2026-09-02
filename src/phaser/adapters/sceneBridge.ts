import type { DomainEvent, GameCommand, GameSnapshot } from '../../game/types';

export type SceneSubscriber = (snapshot: GameSnapshot, events: readonly DomainEvent[]) => void;

export class SceneBridge {
  private snapshot: GameSnapshot = { phase: 'menu', revision: 0 };
  private readonly subscribers = new Set<SceneSubscriber>();
  private commandHandler?: (command: GameCommand) => void;

  setCommandHandler(handler: (command: GameCommand) => void): void {
    this.commandHandler = handler;
  }

  dispatch(command: GameCommand): void {
    this.commandHandler?.(command);
  }

  publish(snapshot: GameSnapshot, events: readonly DomainEvent[]): void {
    this.snapshot = snapshot;
    for (const subscriber of this.subscribers) subscriber(snapshot, events);
  }

  subscribe(subscriber: SceneSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.snapshot, []);
    return () => this.subscribers.delete(subscriber);
  }
}
