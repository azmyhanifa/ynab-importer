'use client';

import { useMemo } from 'react';
import HighlightedSms from './HighlightedSms';
import SearchPicker, { pickerInputClass } from './SearchPicker';
import type { SmsGuess, SmsParseFields, SmsDirection } from '../lib/smsParser';
import { USD_TO_AED } from '../lib/smsParser';
import type { YNABAccount } from '../types';
import {
  categoryLabel,
  findCategoryById,
  findCategoryByLabel,
  type YnabCategory,
} from '../lib/ynabCategories';

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

export default function SmsConfirmModal({
  guess,
  fields,
  remaining,
  payees,
  payeesLoading = false,
  accounts,
  accountsLoading = false,
  categories = [],
  categoriesLoading = false,
  payeeCategoryMap = {},
  onChange,
  onConfirm,
  onSkip,
}: {
  guess: SmsGuess;
  fields: SmsParseFields;
  remaining: number;
  payees: string[];
  payeesLoading?: boolean;
  accounts: YNABAccount[];
  accountsLoading?: boolean;
  categories?: YnabCategory[];
  categoriesLoading?: boolean;
  payeeCategoryMap?: Record<string, string>;
  onChange: (fields: SmsParseFields) => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const set = <K extends keyof SmsParseFields>(key: K, value: SmsParseFields[K]) =>
    onChange({ ...fields, [key]: value });

  const sourceCurrency = (guess.fields.currency || 'AED').toUpperCase();
  const convertedFromUsd = sourceCurrency === 'USD';

  const accountOk = accounts.length === 0 || !!fields.accountId;
  const canConfirm = !!fields.amount && !!fields.payee?.trim() && accountOk;

  const sortedAccounts = useMemo(
    () => accounts.slice().sort((a, b) => Number(b.on_budget) - Number(a.on_budget)),
    [accounts],
  );

  const categoryOptions = useMemo(() => categories.map(categoryLabel), [categories]);
  const categoryValue = useMemo(() => {
    const match = findCategoryById(categories, fields.categoryId);
    return match ? categoryLabel(match) : fields.categoryName ?? '';
  }, [categories, fields.categoryId, fields.categoryName]);

  const applyPayee = (name: string) => {
    const catId = payeeCategoryMap[name];
    const cat = findCategoryById(categories, catId);
    onChange({
      ...fields,
      payee: name,
      ...(cat
        ? { categoryId: cat.id, categoryName: cat.name }
        : {}),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-4 pt-4 pb-2 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Confirm SMS format</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Check the highlights, pick the YNAB payee and account. We’ll remember this layout.
            {remaining > 1 ? ` · ${remaining - 1} more in queue` : ''}
          </p>
        </div>

        <div className="px-4 py-3 overflow-y-auto space-y-3 overscroll-contain">
          <div className="rounded-xl bg-ynab-bg border border-ynab-border px-3 py-2.5">
            <HighlightedSms raw={guess.raw} highlights={guess.highlights} />
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-500">Amount (AED)</span>
            <input
              type="text"
              inputMode="decimal"
              value={fields.amount}
              onChange={e => set('amount', e.target.value)}
              className={pickerInputClass}
            />
            {convertedFromUsd && (
              <p className="text-xs text-ynab-muted">
                USD {guess.fields.amount} → AED {fields.amount} @ {USD_TO_AED}
              </p>
            )}
          </label>

          <SearchPicker
            label="Payee"
            hint={
              guess.fields.payee && guess.fields.payee !== fields.payee
                ? `SMS: ${guess.fields.payee}`
                : undefined
            }
            value={fields.payee}
            placeholder={payeesLoading ? 'Loading payees…' : 'Search or type a payee'}
            options={payees}
            loading={payeesLoading}
            emptyLabel={payees.length ? 'No payees found' : 'Type a payee name'}
            onSelect={applyPayee}
            allowCustom
          />

          <SearchPicker
            label="Category"
            value={categoryValue}
            placeholder={categoriesLoading ? 'Loading categories…' : 'Search categories'}
            options={categoryOptions}
            loading={categoriesLoading}
            emptyLabel={categories.length ? 'No categories found' : 'Connect YNAB to pick a category'}
            allowEmpty
            onSelect={label => {
              if (!label) {
                onChange({ ...fields, categoryId: '', categoryName: '' });
                return;
              }
              const cat = findCategoryByLabel(categories, label);
              onChange({
                ...fields,
                categoryId: cat?.id ?? '',
                categoryName: cat?.name ?? label,
              });
            }}
          />

          <SearchPicker
            label="Account"
            hint={fields.last4 ? `Ending ${fields.last4}` : undefined}
            value={sortedAccounts.find(a => a.id === fields.accountId)?.name ?? ''}
            placeholder={accountsLoading ? 'Loading accounts…' : 'Search YNAB accounts'}
            options={sortedAccounts.map(a => a.name)}
            optionMeta={Object.fromEntries(
              sortedAccounts.map(a => [
                a.name,
                `${ACCOUNT_TYPE_LABELS[a.type] ?? a.type}${a.on_budget ? '' : ' · off-budget'}`,
              ]),
            )}
            loading={accountsLoading}
            emptyLabel={accounts.length ? 'No accounts found' : 'Connect YNAB to pick an account'}
            onSelect={name => {
              const account = sortedAccounts.find(a => a.name === name);
              if (account) set('accountId', account.id);
            }}
          />

          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-500">Date</span>
            <input
              type="date"
              value={fields.date}
              onChange={e => set('date', e.target.value)}
              className={pickerInputClass}
            />
          </label>

          <div className="space-y-1">
            <span className="text-xs font-medium text-gray-500">Direction</span>
            <div className="flex gap-2">
              {(['outflow', 'inflow'] as SmsDirection[]).map(dir => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => set('direction', dir)}
                  className={`flex-1 min-h-[40px] px-3 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${
                    fields.direction === dir
                      ? dir === 'outflow'
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-ynab-green bg-ynab-green text-white'
                      : 'border-ynab-border text-gray-600'
                  }`}
                >
                  {dir === 'outflow' ? 'Outflow' : 'Inflow'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 min-h-[44px] px-4 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="flex-1 min-h-[44px] px-4 py-2.5 bg-ynab-navy text-white text-sm font-medium rounded-xl disabled:opacity-50"
          >
            Add & remember
          </button>
        </div>
      </div>
    </div>
  );
}
