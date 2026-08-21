export interface YNABAccount {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  deleted: boolean;
}

export interface YNABTransaction {
  Date: string;
  Payee: string;
  Memo: string;
  Outflow: string;
  Inflow: string;
  source?: 'excel' | 'sms';
  last4?: string;
  accountId?: string;
  categoryId?: string;
  categoryName?: string;
}
