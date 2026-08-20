import HighlightedSms from './HighlightedSms';
import type { SmsGuess, SmsParseFields, SmsDirection } from '../lib/smsParser';

export default function SmsConfirmModal({
  guess,
  fields,
  remaining,
  onChange,
  onConfirm,
  onSkip,
}: {
  guess: SmsGuess;
  fields: SmsParseFields;
  remaining: number;
  onChange: (fields: SmsParseFields) => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const set = <K extends keyof SmsParseFields>(key: K, value: SmsParseFields[K]) =>
    onChange({ ...fields, [key]: value });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Confirm SMS format</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Check the highlighted fields. We’ll remember this layout for next time.
            {remaining > 1 ? ` · ${remaining - 1} more in queue` : ''}
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          <div className="rounded-xl bg-ynab-bg border border-ynab-border px-3 py-3">
            <HighlightedSms raw={guess.raw} highlights={guess.highlights} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 col-span-2 sm:col-span-1">
              <span className="text-xs font-medium text-gray-500">Amount</span>
              <input
                type="text"
                inputMode="decimal"
                value={fields.amount}
                onChange={e => set('amount', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="space-y-1 col-span-2 sm:col-span-1">
              <span className="text-xs font-medium text-gray-500">Currency</span>
              <input
                type="text"
                value={fields.currency}
                onChange={e => set('currency', e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-xs font-medium text-gray-500">Payee</span>
              <input
                type="text"
                value={fields.payee}
                onChange={e => set('payee', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-500">Card last 4</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={fields.last4}
                onChange={e => set('last4', e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-500">Date</span>
              <input
                type="date"
                value={fields.date}
                onChange={e => set('date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-xs font-medium text-gray-500">Direction</span>
              <div className="flex gap-2">
                {(['outflow', 'inflow'] as SmsDirection[]).map(dir => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => set('direction', dir)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                      fields.direction === dir
                        ? dir === 'outflow'
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-ynab-green bg-ynab-green text-white'
                        : 'border-ynab-border text-gray-600 hover:border-ynab-navy/30'
                    }`}
                  >
                    {dir === 'outflow' ? 'Outflow (purchase)' : 'Inflow (refund)'}
                  </button>
                ))}
              </div>
            </label>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!fields.amount || !fields.payee}
            className="flex-1 px-4 py-2.5 bg-ynab-navy text-white text-sm font-medium rounded-xl hover:bg-ynab-blue disabled:opacity-50"
          >
            Add & remember
          </button>
        </div>
      </div>
    </div>
  );
}
