export interface InputBindings {
  hand: string[];
  endTurn: string;
}

export interface GameSettings {
  volume: number;
  reducedMotion: boolean;
  bindings: InputBindings;
}

export const SETTINGS_KEY = 'roguelike-card-framework.settings.v2';
export const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.7,
  reducedMotion: false,
  bindings: { hand: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], endTurn: 'e' },
};

export class SettingsStore {
  constructor(private readonly storage: Storage = window.localStorage) {}

  load(): GameSettings {
    const raw = this.storage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    try {
      const parsed = JSON.parse(raw) as GameSettings;
      if (!Array.isArray(parsed.bindings?.hand) || parsed.bindings.hand.length !== 10) throw new Error('Invalid bindings');
      return { ...structuredClone(DEFAULT_SETTINGS), ...parsed, volume: Math.max(0, Math.min(1, parsed.volume)) };
    } catch {
      this.storage.removeItem(SETTINGS_KEY);
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  save(settings: GameSettings): void {
    this.storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
}
