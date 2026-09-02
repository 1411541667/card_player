import type { RunSaveV2 } from './types';

export const SAVE_KEY = 'roguelike-card-framework.run.v2';

export class BrowserSaveStore {
  constructor(private readonly storage: Storage = window.localStorage, private accountId?: string) {}
  setAccountId(accountId: string): void { this.accountId = accountId; }
  private key(): string { return this.accountId ? `${SAVE_KEY}.${this.accountId}` : SAVE_KEY; }

  save(value: RunSaveV2): void {
    this.storage.setItem(this.key(), JSON.stringify(value));
  }

  load(): RunSaveV2 | undefined {
    const raw = this.storage.getItem(this.key());
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as Partial<RunSaveV2>;
      if (parsed.schemaVersion !== 2 || !parsed.game || !parsed.random) throw new Error('Invalid save structure.');
      return parsed as RunSaveV2;
    } catch (error) {
      this.storage.removeItem(this.key());
      throw new Error(`Save data was invalid and has been quarantined: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  clear(): void {
    this.storage.removeItem(this.key());
  }

  export(value: RunSaveV2): string {
    return JSON.stringify(value, null, 2);
  }

  import(raw: string): RunSaveV2 {
    const parsed = JSON.parse(raw) as RunSaveV2;
    if (parsed.schemaVersion !== 2 || !parsed.game || !parsed.random) throw new Error('Imported save is not a RunSaveV2 document.');
    return parsed;
  }
}
