import type { ContentPack, MetaProgressV2, RunState } from './types';

export const META_PROGRESS_KEY = 'roguelike-card-framework.meta.v2';

export function createInitialMetaProgress(pack: ContentPack): MetaProgressV2 {
  return {
    schemaVersion: 2,
    tokens: 0,
    unlockedCharacterIds: [pack.ruleSet.startingCharacterId],
    unlockedCardIds: [...new Set(pack.ruleSet.startingDeck)],
    unlockedStoryIds: [],
    purchasedUpgradeIds: [],
    discoveredCharacterIds: [],
    discoveredCardIds: [],
    discoveredEnemyIds: [],
    discoveredCollectibleIds: [],
    runHistory: [],
  };
}

export class MetaProgressStore {
  constructor(private readonly storage: Storage = window.localStorage, private accountId?: string) {}
  setAccountId(accountId: string): void { this.accountId = accountId; }
  private key(): string { return this.accountId ? `${META_PROGRESS_KEY}.${this.accountId}` : META_PROGRESS_KEY; }

  load(fallback: MetaProgressV2): MetaProgressV2 {
    const raw = this.storage.getItem(this.key());
    if (!raw) return structuredClone(fallback);
    try {
      const parsed = JSON.parse(raw) as MetaProgressV2;
      if (parsed.schemaVersion !== 2) throw new Error(`Unsupported meta progress schema: ${String(parsed.schemaVersion)}`);
      return {
        ...parsed,
        unlockedStoryIds: parsed.unlockedStoryIds ?? [],
        discoveredCharacterIds: parsed.discoveredCharacterIds ?? [],
        discoveredCardIds: parsed.discoveredCardIds ?? [],
        discoveredEnemyIds: parsed.discoveredEnemyIds ?? [],
        discoveredCollectibleIds: parsed.discoveredCollectibleIds ?? [],
        runHistory: (parsed.runHistory ?? []).slice(0, 3),
      };
    } catch {
      this.storage.removeItem(this.key());
      return structuredClone(fallback);
    }
  }

  save(profile: MetaProgressV2): void {
    this.storage.setItem(this.key(), JSON.stringify(profile));
  }

  recordRun(profile: MetaProgressV2, run: RunState): MetaProgressV2 {
    if (!run.result || profile.runHistory.some((entry) => entry.runId === run.id)) return profile;
    const next = structuredClone(profile);
    next.tokens += run.result.metaTokens;
    next.runHistory.unshift({
      runId: run.id,
      seed: run.seed,
      outcome: run.result.outcome,
      score: run.result.score,
      earnedTokens: run.result.metaTokens,
      floorReached: run.floor,
      battles: run.metrics.battlesStarted,
      defeatedById: run.result.defeatedById,
      finishedAt: new Date().toISOString(),
    });
    next.runHistory = next.runHistory.slice(0, 3);
    return next;
  }

  unlockCharacter(profile: MetaProgressV2, characterId: string, cost: number): MetaProgressV2 {
    return this.purchaseUnlock(profile, 'unlockedCharacterIds', characterId, cost);
  }

  unlockCard(profile: MetaProgressV2, cardId: string, cost: number): MetaProgressV2 {
    return this.purchaseUnlock(profile, 'unlockedCardIds', cardId, cost);
  }

  purchaseUpgrade(profile: MetaProgressV2, upgradeId: string, cost: number): MetaProgressV2 {
    return this.purchaseUnlock(profile, 'purchasedUpgradeIds', upgradeId, cost);
  }

  unlockStory(profile: MetaProgressV2, storyId: string): MetaProgressV2 {
    return this.purchaseUnlock(profile, 'unlockedStoryIds', storyId, 0);
  }

  private purchaseUnlock(
    profile: MetaProgressV2,
    field: 'unlockedCharacterIds' | 'unlockedCardIds' | 'purchasedUpgradeIds' | 'unlockedStoryIds',
    id: string,
    cost: number,
  ): MetaProgressV2 {
    if (profile[field].includes(id)) return profile;
    if (!Number.isFinite(cost) || cost < 0) throw new Error('Unlock cost must be a non-negative number.');
    if (profile.tokens < cost) throw new Error('Not enough meta-progression tokens.');
    const next = structuredClone(profile);
    next.tokens -= cost;
    next[field].push(id);
    return next;
  }
}
