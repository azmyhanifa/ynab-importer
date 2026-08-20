import type { SmsHighlight } from '../lib/smsParser';

const HIGHLIGHT_CLASS: Record<string, string> = {
  amount: 'bg-ynab-green-light text-ynab-navy font-semibold',
  currency: 'bg-ynab-green-light text-ynab-navy',
  last4: 'bg-blue-100 text-blue-800 font-semibold',
  payee: 'bg-amber-100 text-amber-900 font-semibold',
  date: 'bg-purple-100 text-purple-800',
  ignored: 'bg-gray-100 text-gray-400 line-through',
};

export default function HighlightedSms({
  raw,
  highlights,
}: {
  raw: string;
  highlights: SmsHighlight[];
}) {
  const sorted = [...highlights]
    .filter(h => h.start >= 0 && h.end > h.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const parts: { text: string; field?: string }[] = [];
  let cursor = 0;
  for (const h of sorted) {
    if (h.start < cursor) continue;
    if (h.start > cursor) parts.push({ text: raw.slice(cursor, h.start) });
    parts.push({ text: raw.slice(h.start, h.end), field: h.field });
    cursor = h.end;
  }
  if (cursor < raw.length) parts.push({ text: raw.slice(cursor) });

  return (
    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.field ? (
          <mark key={i} className={`rounded px-0.5 ${HIGHLIGHT_CLASS[p.field] ?? 'bg-gray-100'}`}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}
