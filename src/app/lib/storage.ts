const TEMPLATES_KEY = 'ynab_sms_templates';
const CARD_ACCOUNTS_KEY = 'ynab_card_accounts';
const DRAFT_KEY = 'ynab_draft_transactions';

export interface DraftTransaction {
  Date: string;
  Payee: string;
  Memo: string;
  Outflow: string;
  Inflow: string;
  source?: 'excel' | 'sms';
  last4?: string;
  accountId?: string;
}

export interface DraftState {
  transactions: DraftTransaction[];
  statuses: string[];
  selected: number[];
  overrides: Record<number, string>;
  fileName: string;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadSmsTemplates<T>(): T[] {
  return readJson<T[]>(TEMPLATES_KEY, []);
}

export function saveSmsTemplates(templates: unknown[]) {
  writeJson(TEMPLATES_KEY, templates);
}

export function loadCardAccounts(): Record<string, string> {
  return readJson<Record<string, string>>(CARD_ACCOUNTS_KEY, {});
}

export function saveCardAccounts(map: Record<string, string>) {
  writeJson(CARD_ACCOUNTS_KEY, map);
}

export function loadDraft(): DraftState | null {
  const draft = readJson<DraftState | null>(DRAFT_KEY, null);
  if (!draft || !Array.isArray(draft.transactions) || draft.transactions.length === 0) {
    return null;
  }
  return {
    transactions: draft.transactions,
    statuses: draft.statuses ?? [],
    selected: draft.selected ?? draft.transactions.map((_, i) => i),
    overrides: draft.overrides ?? {},
    fileName: draft.fileName ?? '',
  };
}

export function saveDraft(state: DraftState) {
  if (state.transactions.length === 0) {
    if (typeof window !== 'undefined') localStorage.removeItem(DRAFT_KEY);
    return;
  }
  writeJson(DRAFT_KEY, state);
}

export function clearDraft() {
  if (typeof window !== 'undefined') localStorage.removeItem(DRAFT_KEY);
}
