'use client';

import { useMemo, useState } from 'react';
import HighlightedSms from './HighlightedSms';
import type { SmsGuess, SmsParseFields, SmsDirection } from '../lib/smsParser';
import { USD_TO_AED } from '../lib/smsParser';
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

const inputClass =
  'w-full min-h-[44px] px-3 py-2.5 border border-gray-200 rounded-xl text-base text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-ynab-green';

export default function SmsConfirmModal({
  guess,
  fields,
  remaining,
  payees,
  payeesLoading = false,
  accounts,
  accountsLoading = false,
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
  onChange: (fields: SmsParseFields) => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const set = <K extends keyof SmsParseFields>(key: K, value: SmsParseFields[K]) =>
    onChange({ ...fields, [key]: value });

  const sourceCurrency = (guess.fields.currency || 'AED').toUpperCase();
  const convertedFromUsd = sourceCurrency === 'USD';

  const payeeInList = payees.length === 0 || payees.includes(fields.payee);
  const accountOk = accounts.length === 0 || !!fields.accountId;
  const canConfirm = !!fields.amount && !!fields.payee && payeeInList && accountOk;

  const sortedAccounts = useMemo(
    () => accounts.slice().sort((a, b) => Number(b.on_budget) - Number(a.on_budget)),
    [accounts],
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Confirm SMS format</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Check the highlights, pick the YNAB payee and account. We’ll remember this layout.
            {remaining > 1 ? ` · ${remaining - 1} more in queue` : ''}
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4 overscroll-contain">
          <div className="rounded-xl bg-ynab-bg border border-ynab-border px-3 py-3">
            <HighlightedSms raw={guess.raw} highlights={guess.highlights} />
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-500">Amount (AED)</span>
            <input
              type="text"
              inputMode="decimal"
              value={fields.amount}
              onChange={e => set('amount', e.target.value)}
              className={inputClass}
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
            placeholder={payeesLoading ? 'Loading payees…' : 'Search YNAB payees'}
            options={payees}
            loading={payeesLoading}
            emptyLabel={payees.length ? 'No payees found' : 'Connect YNAB to pick a payee'}
            onSelect={name => set('payee', name)}
            allowCustom={payees.length === 0}
            onCustomChange={name => set('payee', name)}
          />

          <SearchPicker
            label="Account"
            hint={fields.last4 ? `Card ending ${fields.last4}` : undefined}
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
              className={inputClass}
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
                  className={`flex-1 min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
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

        <div className="px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 min-h-[48px] px-4 py-3 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="flex-1 min-h-[48px] px-4 py-3 bg-ynab-navy text-white text-sm font-medium rounded-xl disabled:opacity-50"
          >
            Add & remember
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchPicker({
  label,
  hint,
  value,
  placeholder,
  options,
  optionMeta,
  loading,
  emptyLabel,
  onSelect,
  allowCustom = false,
  onCustomChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  options: string[];
  optionMeta?: Record<string, string>;
  loading?: boolean;
  emptyLabel: string;
  onSelect: (value: string) => void;
  allowCustom?: boolean;
  onCustomChange?: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(!value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter(o => o.toLowerCase().includes(q)) : [...options];
    if (value && list.includes(value)) {
      return [value, ...list.filter(o => o !== value)].slice(0, 12);
    }
    return list.slice(0, 12);
  }, [options, query, value]);

  const customMode = allowCustom && options.length === 0;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {hint && <span className="text-[11px] text-ynab-muted truncate">{hint}</span>}
      </div>

      {customMode ? (
        <input
          type="text"
          autoComplete="off"
          value={value}
          onChange={e => onCustomChange?.(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className={`${inputClass} text-left flex items-center justify-between gap-2`}
          >
            <span className={value ? 'truncate text-foreground' : 'truncate text-ynab-muted'}>
              {value || placeholder}
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <div className="rounded-xl border border-ynab-border overflow-hidden">
              <div className="p-2 border-b border-gray-100">
                <input
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={placeholder}
                  className="w-full min-h-[40px] px-3 py-2 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-ynab-green"
                />
              </div>
              <div className="max-h-44 overflow-y-auto payee-scroll">
                {loading ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
                    Loading…
                  </div>
                ) : filtered.length > 0 ? (
                  filtered.map(option => {
                    const selected = option === value;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          onSelect(option);
                          setQuery('');
                          setOpen(false);
                        }}
                        className={`w-full min-h-[44px] text-left px-3 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                          selected ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 active:bg-gray-50'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{option}</span>
                          {optionMeta?.[option] && (
                            <span className="block text-[11px] text-gray-400 font-normal">{optionMeta[option]}</span>
                          )}
                        </span>
                        {selected && (
                          <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <p className="px-3 py-3 text-sm text-gray-400">{emptyLabel}</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
