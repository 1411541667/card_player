export interface LocalAccount {
  id: string;
  nickname: string;
  createdAt: string;
  lastUsedAt: string;
}

interface AccountIndex { version: 1; lastAccountId?: string; accounts: LocalAccount[] }
export const ACCOUNTS_KEY = 'roguelike-card-framework.accounts.v1';

export class AccountStore {
  constructor(private readonly storage: Storage = window.localStorage) {}
  private read(): AccountIndex {
    try {
      const parsed = JSON.parse(this.storage.getItem(ACCOUNTS_KEY) ?? '') as AccountIndex;
      if (parsed.version === 1 && Array.isArray(parsed.accounts)) return parsed;
    } catch { /* initialize below */ }
    return { version: 1, accounts: [] };
  }
  private write(index: AccountIndex): void { this.storage.setItem(ACCOUNTS_KEY, JSON.stringify(index)); }
  list(): LocalAccount[] { return this.read().accounts; }
  current(): LocalAccount | undefined { const index = this.read(); return index.accounts.find((account) => account.id === index.lastAccountId); }
  create(nickname: string): LocalAccount {
    const name = nickname.trim();
    if (!name) throw new Error('昵称不能为空。');
    const index = this.read();
    if (index.accounts.some((account) => account.nickname.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('该昵称已存在。');
    const now = new Date().toISOString();
    const account = { id: globalThis.crypto?.randomUUID?.() ?? `account-${Date.now()}-${Math.random().toString(36).slice(2)}`, nickname: name, createdAt: now, lastUsedAt: now };
    index.accounts.push(account); index.lastAccountId = account.id; this.write(index); return account;
  }
  switch(accountId: string): LocalAccount {
    const index = this.read(); const account = index.accounts.find((item) => item.id === accountId);
    if (!account) throw new Error('账号不存在。');
    account.lastUsedAt = new Date().toISOString(); index.lastAccountId = account.id; this.write(index); return account;
  }
  remove(accountId: string): void {
    const index = this.read();
    if (!index.accounts.some((item) => item.id === accountId)) throw new Error('账号不存在。');
    index.accounts = index.accounts.filter((item) => item.id !== accountId);
    if (index.lastAccountId === accountId) index.lastAccountId = index.accounts.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0]?.id;
    this.write(index);
  }
}
