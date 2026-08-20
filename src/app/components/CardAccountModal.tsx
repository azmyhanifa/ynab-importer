import type { YNABAccount } from '../types';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  cash: 'Cash',
  creditCard: 'Credit Card',
  lineOfCredit: 'Line of Credit',
  otherAsset: 'Other Asset',
  otherLiability: 'Other Liability',
  payPal: 'PayPal',
  merchantAccount: 'Merchant',
  investmentAccount: 'Investment',
  mortgage: 'Mortgage',
};

export default function CardAccountModal({
  last4,
  accounts,
  loading,
  remaining,
  onPick,
  onSkip,
}: {
  last4: string;
  accounts: YNABAccount[];
  loading: boolean;
  remaining: number;
  onPick: (accountId: string) => void;
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Link card ending {last4}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            We’ll send these SMS transactions to this YNAB account.
            {remaining > 1 ? ` · ${remaining - 1} more cards` : ''}
          </p>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-2 max-h-72">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
              Loading accounts…
            </div>
          ) : (
            accounts
              .slice()
              .sort((a, b) => Number(b.on_budget) - Number(a.on_budget))
              .map(account => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => onPick(account.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-ynab-border hover:border-indigo-500 hover:bg-indigo-50 text-left transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{account.name}</p>
                    <p className="text-xs text-gray-400">
                      {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                      {account.on_budget ? '' : ' · off-budget'}
                    </p>
                  </div>
                </button>
              ))
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onSkip}
            className="w-full px-4 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
