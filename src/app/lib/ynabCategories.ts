export interface YnabCategory {
  id: string;
  name: string;
  group: string;
}

interface YnabCategoryGroupRaw {
  id?: string;
  name?: string;
  hidden?: boolean;
  deleted?: boolean;
  categories?: {
    id: string;
    name: string;
    hidden?: boolean;
    deleted?: boolean;
  }[];
}

const SKIP_GROUPS = new Set([
  'Internal Master Category',
  'Credit Card Payments',
  'Hidden Categories',
]);

export function flattenCategories(groups: YnabCategoryGroupRaw[] = []): YnabCategory[] {
  const result: YnabCategory[] = [];
  for (const group of groups) {
    if (group.deleted || group.hidden) continue;
    if (SKIP_GROUPS.has(group.name ?? '')) continue;
    for (const category of group.categories ?? []) {
      if (category.deleted || category.hidden) continue;
      result.push({
        id: category.id,
        name: category.name,
        group: group.name ?? '',
      });
    }
  }
  return result;
}

export function categoryLabel(category: YnabCategory): string {
  return category.group ? `${category.group} · ${category.name}` : category.name;
}

export function findCategoryByLabel(categories: YnabCategory[], label: string): YnabCategory | undefined {
  return categories.find(c => categoryLabel(c) === label || c.name === label);
}

export function findCategoryById(categories: YnabCategory[], id?: string): YnabCategory | undefined {
  if (!id) return undefined;
  return categories.find(c => c.id === id);
}

interface YnabTxnForMap {
  payee_name?: string | null;
  category_id?: string | null;
  date?: string | null;
}

/** Most-recent category_id per payee_name (later dates win). */
export function buildPayeeCategoryMap(transactions: YnabTxnForMap[]): Record<string, string> {
  const sorted = [...transactions].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const map: Record<string, string> = {};
  for (const txn of sorted) {
    const payee = txn.payee_name?.trim();
    const categoryId = txn.category_id?.trim();
    if (!payee || !categoryId) continue;
    map[payee] = categoryId;
  }
  return map;
}
