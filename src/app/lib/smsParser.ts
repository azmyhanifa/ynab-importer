export type SmsDirection = 'outflow' | 'inflow';

export interface SmsParseFields {
  amount: string;
  currency: string;
  last4: string;
  payee: string;
  direction: SmsDirection;
  date: string;
}

export type SmsHighlightField = keyof SmsParseFields | 'ignored';

export interface SmsHighlight {
  field: SmsHighlightField;
  start: number;
  end: number;
}

export interface SmsGuess {
  fields: SmsParseFields;
  highlights: SmsHighlight[];
  confidence: 'high' | 'weak';
  raw: string;
}

export interface SmsTemplate {
  id: string;
  sample: string;
  pattern: string;
}

export interface TemplateMatch {
  fields: SmsParseFields;
  template: SmsTemplate;
  highlights: SmsHighlight[];
}

const CITIES = [
  'DUBAI',
  'SHARJAH',
  'ABU DHABI',
  'ABUDHABI',
  'AJMAN',
  'AL AIN',
  'RAS AL KHAIMAH',
  'FUJAIRAH',
  'UMM AL QUWAIN',
  'UAE',
  'DXB',
];

const CITY_ALT = CITIES.join('|');
const CITY_TRAIL_RE = new RegExp(`(?:\\s*,\\s*|\\s+)(?:${CITY_ALT})(?:\\s*,\\s*UAE)?\\.?$`, 'i');

const MONEY_RE = /(?:(AED|USD|EUR|GBP|SAR|QAR|KWD|BHD|OMR)\s*)?([\d,]+\.\d{2}|\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})/gi;
const IGNORE_AMOUNT_RE = /\b(avl|avail(?:able)?|limit|balance|bal\.?|cr\.?\s*limit|available credit)\b/i;
const LAST4_RE = /(?:ending[:\s]+|(?:card|cc)(?:\s+no\.?)?[:\s]+(?:xx+|[*x]{2,})?|(?:xx|[*x]{2,}))\s*(\d{4})/i;
const LAST4_FALLBACK_RE = /(?:card|credit\s+card)[^\d]{0,20}(\d{4})/i;
const OUTFLOW_RE = /\b(purchase|payment|pos|withdrawal|withdrawn|spent|debit|paid|charge[ds]?)\b/i;
const INFLOW_RE = /\b(refund|credited|received|deposit|salary|reversed|reversal|cashback)\b/i;
const DIRECTION_VERB_GROUP = '(?:Purchase|Payment|Refund|POS|Withdrawal|Withdrawn|Spent|Debit|Paid|Charged|Credited|Received|Deposit)';
const DATE_ON_RE = /\bon\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i;
const DATE_TEXT_RE = /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4})/i;

export function todayISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatAmount(n: number | string): string {
  const num = typeof n === 'string' ? parseFloat(n.replace(/,/g, '')) : n;
  if (!Number.isFinite(num)) return '0.00';
  return Math.abs(num).toFixed(2);
}

export function splitSmsMessages(text: string): string[] {
  const trimmed = text.replace(/[\u201C\u201D\u2018\u2019]/g, '"').trim();
  if (!trimmed) return [];

  const byBlank = trimmed
    .split(/\n\s*\n/)
    .map(s => s.replace(/^["'\s]+|["'\s]+$/g, '').trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;

  const lines = trimmed
    .split(/\n/)
    .map(s => s.replace(/^["'\s]+|["'\s]+$/g, '').trim())
    .filter(Boolean);
  const looksComplete = (l: string) =>
    l.length > 40 && /(?:AED|USD|EUR|GBP|SAR)\s*[\d,]/.test(l);
  if (lines.length > 1 && lines.every(looksComplete)) return lines;

  return [trimmed.replace(/^["'\s]+|["'\s]+$/g, '')];
}

function parseDateString(raw: string): string | null {
  const on = DATE_ON_RE.exec(raw);
  if (on) {
    const parsed = parseNumericDate(on[1]);
    if (parsed) return parsed;
  }
  const text = DATE_TEXT_RE.exec(raw);
  if (text) {
    const d = new Date(text[1]);
    if (!isNaN(d.getTime())) return todayISO(d);
  }
  return null;
}

function parseNumericDate(s: string): string | null {
  const parts = s.split(/[/-]/).map(p => p.trim());
  if (parts.length !== 3) return null;
  const [a, b] = parts;
  let c = parts[2];
  if (c.length === 2) c = `20${c}`;
  const year = c;
  const day = a.padStart(2, '0');
  const month = b.padStart(2, '0');
  if (!/^\d{4}$/.test(year) || Number(month) > 12) return null;
  return `${year}-${month}-${day}`;
}

function guessDirection(raw: string): SmsDirection {
  if (INFLOW_RE.test(raw) && !OUTFLOW_RE.test(raw)) return 'inflow';
  if (INFLOW_RE.test(raw) && /\brefund\b/i.test(raw)) return 'inflow';
  return 'outflow';
}

interface MoneyHit {
  currency: string;
  amount: string;
  start: number;
  end: number;
  ignored: boolean;
}

function findMoneyHits(raw: string): MoneyHit[] {
  const hits: MoneyHit[] = [];
  const re = new RegExp(MONEY_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const prefix = raw.slice(Math.max(0, m.index - 40), m.index);
    const ignored = IGNORE_AMOUNT_RE.test(prefix);
    hits.push({
      currency: (m[1] || '').toUpperCase(),
      amount: formatAmount(m[2]),
      start: m.index,
      end: m.index + m[0].length,
      ignored,
    });
  }
  return hits;
}

function findLast4(raw: string): { value: string; start: number; end: number } | null {
  const m = LAST4_RE.exec(raw) || LAST4_FALLBACK_RE.exec(raw);
  if (!m) return null;
  const value = m[1];
  const start = m.index + m[0].lastIndexOf(value);
  return { value, start, end: start + 4 };
}

function stripCitySuffix(payee: string): string {
  return payee.replace(CITY_TRAIL_RE, '').replace(/[.,;:\s]+$/g, '').trim();
}

function findPayee(raw: string): { value: string; start: number; end: number } | null {
  const marker = /\b(?:at|to)\s+/i.exec(raw);
  if (!marker) return null;
  const start = marker.index + marker[0].length;
  const rest = raw.slice(start);
  const endRel = rest.search(/\s*\.(?:\s|$)|(?:\s+on\s+\d)|(?:\s+Avl\b)|(?:\s+Avail)|(?:\s+Balance\b)|(?:\s+Available\b)/i);
  const rawEnd = endRel === -1 ? raw.length : start + endRel;
  const original = raw.slice(start, rawEnd).trim();
  const value = stripCitySuffix(original);
  if (!value) return null;
  const inRaw = raw.indexOf(value, start);
  const spanStart = inRaw >= 0 ? inRaw : start;
  return { value, start: spanStart, end: spanStart + value.length };
}

export function guessSms(raw: string): SmsGuess {
  const text = raw.replace(/[\u201C\u201D]/g, '"').trim();
  const money = findMoneyHits(text);
  const txn = money.find(h => !h.ignored) ?? money[0];
  const last4 = findLast4(text);
  const payee = findPayee(text);
  const date = parseDateString(text) || todayISO();
  const direction = guessDirection(text);

  const fields: SmsParseFields = {
    amount: txn ? txn.amount : '',
    currency: txn?.currency || (text.match(/\b(AED|USD|EUR|GBP|SAR)\b/i)?.[1].toUpperCase() ?? 'AED'),
    last4: last4?.value ?? '',
    payee: payee?.value ?? '',
    direction,
    date,
  };

  const highlights: SmsHighlight[] = [];
  if (txn) {
    highlights.push({ field: 'amount', start: txn.start, end: txn.end });
  }
  if (last4) highlights.push({ field: 'last4', start: last4.start, end: last4.end });
  if (payee) highlights.push({ field: 'payee', start: payee.start, end: payee.end });
  for (const hit of money) {
    if (hit.ignored) highlights.push({ field: 'ignored', start: hit.start, end: hit.end });
  }

  const unusedAmounts = money.filter(h => !h.ignored).length > 1;
  const confidence: 'high' | 'weak' =
    fields.amount && fields.payee && fields.last4 && !unusedAmounts ? 'high' : 'weak';

  return { fields, highlights, confidence, raw: text };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generalizeLiteral(literal: string): string {
  if (!literal) return '';
  const parts = literal.split(/(\d[\d,]*\.?\d*)/);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return '\\d[\\d,.]*';
      return escapeRegex(part)
        .replace(/\b(?:Purchase|Payment|Refund|POS|Withdrawal|Withdrawn|Spent|Debit|Paid|Charged|Credited|Received|Deposit)\b/gi, DIRECTION_VERB_GROUP)
        .replace(/\s+/g, '\\s+');
    })
    .join('');
}

function fieldPattern(field: 'amount' | 'currency' | 'last4' | 'payee'): string {
  switch (field) {
    case 'amount':
      return '(?<amount>[\\d,]+\\.\\d{2}|\\d[\\d,]*)';
    case 'currency':
      return '(?<currency>[A-Z]{3})';
    case 'last4':
      return '(?<last4>\\d{4})';
    case 'payee':
      return '(?<payee>.+?)';
  }
}

interface Span {
  field: 'amount' | 'currency' | 'last4' | 'payee';
  start: number;
  end: number;
}

function findValueSpan(raw: string, value: string, from: number, wholeWord = false): Span | null {
  if (!value) return null;
  const hay = raw.toLowerCase();
  const needle = value.toLowerCase();
  let idx = hay.indexOf(needle, from);
  while (idx !== -1) {
    if (!wholeWord) return { field: 'amount', start: idx, end: idx + value.length };
    const before = idx === 0 || /\W/.test(raw[idx - 1] ?? '');
    const after = idx + value.length >= raw.length || /\W/.test(raw[idx + value.length] ?? '');
    if (before && after) return { field: 'amount', start: idx, end: idx + value.length };
    idx = hay.indexOf(needle, idx + 1);
  }
  return { field: 'amount', start: hay.indexOf(needle), end: hay.indexOf(needle) + value.length };
}

export function findConfirmedSpans(raw: string, fields: SmsParseFields): Span[] {
  const spans: Span[] = [];
  const last4 = findLast4(raw);
  if (fields.last4) {
    if (last4 && last4.value === fields.last4) {
      spans.push({ field: 'last4', start: last4.start, end: last4.end });
    } else {
      const s = findValueSpan(raw, fields.last4, 0, true);
      if (s && s.start >= 0) spans.push({ field: 'last4', start: s.start, end: s.end });
    }
  }

  if (fields.payee) {
    const idx = raw.toLowerCase().indexOf(fields.payee.toLowerCase());
    if (idx >= 0) {
      spans.push({ field: 'payee', start: idx, end: idx + fields.payee.length });
    } else {
      const guessed = findPayee(raw);
      if (guessed) spans.push({ field: 'payee', start: guessed.start, end: guessed.end });
    }
  }

  if (fields.amount) {
    const money = findMoneyHits(raw);
    const match = money.find(h => !h.ignored && h.amount === formatAmount(fields.amount))
      ?? money.find(h => !h.ignored);
    if (match) {
      const amtToken = match.amount;
      const inner = raw.slice(match.start, match.end);
      const amtIdx = inner.toLowerCase().lastIndexOf(amtToken.replace(/\.00$/, '')) >= 0
        ? match.start + inner.search(/[\d,]/)
        : match.start;
      const numMatch = inner.match(/[\d,]+(?:\.\d{2})?/);
      if (numMatch && numMatch.index !== undefined) {
        spans.push({
          field: 'amount',
          start: match.start + numMatch.index,
          end: match.start + numMatch.index + numMatch[0].length,
        });
      } else {
        spans.push({ field: 'amount', start: amtIdx, end: match.end });
      }
      if (fields.currency && match.currency) {
        const cIdx = inner.toUpperCase().indexOf(fields.currency.toUpperCase());
        if (cIdx >= 0) {
          spans.push({
            field: 'currency',
            start: match.start + cIdx,
            end: match.start + cIdx + fields.currency.length,
          });
        }
      }
    }
  } else if (fields.currency) {
    const cIdx = raw.toUpperCase().indexOf(fields.currency.toUpperCase());
    if (cIdx >= 0) {
      spans.push({ field: 'currency', start: cIdx, end: cIdx + fields.currency.length });
    }
  }

  return spans
    .filter(s => s.start >= 0 && s.end > s.start)
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((s, i, arr) => {
      if (i === 0) return true;
      const prev = arr[i - 1];
      return s.start >= prev.end;
    });
}

export function compileTemplate(raw: string, fields: SmsParseFields): SmsTemplate {
  const text = raw.trim();
  const spans = findConfirmedSpans(text, fields);
  let pattern = '^';
  let cursor = 0;
  for (const span of spans) {
    const before = text.slice(cursor, span.start);
    pattern += generalizeLiteral(before);
    if (span.field === 'payee') {
      pattern += '(?<payee>.+?)';
      const afterPayee = text.slice(span.end);
      const city = afterPayee.match(new RegExp(`^(\\s*,\\s*|\\s+)(?:${CITY_ALT})(?:\\s*,\\s*UAE)?`, 'i'));
      if (city) {
        pattern += '(?:\\s*,\\s*[A-Za-z ]+)?';
        cursor = span.end + city[0].length;
        continue;
      }
    } else {
      pattern += fieldPattern(span.field);
    }
    cursor = span.end;
  }
  pattern += generalizeLiteral(text.slice(cursor));
  pattern += '$';

  return {
    id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sample: text,
    pattern,
  };
}

function highlightsFromMatch(raw: string, match: RegExpExecArray, fields: SmsParseFields): SmsHighlight[] {
  const highlights: SmsHighlight[] = [];
  const indices = (match as RegExpExecArray & { indices?: { groups?: Record<string, [number, number]> } }).indices;
  const groups = ['amount', 'currency', 'last4', 'payee'] as const;
  for (const g of groups) {
    if (!fields[g]) continue;
    const range = indices?.groups?.[g];
    if (range) {
      highlights.push({ field: g, start: range[0], end: range[1] });
    } else if (match.groups?.[g]) {
      const val = match.groups[g];
      const start = raw.indexOf(val);
      if (start >= 0) highlights.push({ field: g, start, end: start + val.length });
    }
  }
  return highlights;
}

export function matchTemplate(raw: string, templates: SmsTemplate[]): TemplateMatch | null {
  const text = raw.trim();
  for (const template of templates) {
    let re: RegExp;
    try {
      re = new RegExp(template.pattern, 'isd');
    } catch {
      try {
        re = new RegExp(template.pattern, 'is');
      } catch {
        continue;
      }
    }
    const m = re.exec(text);
    if (!m?.groups) continue;
    const amount = formatAmount(m.groups.amount || '');
    if (!amount || amount === '0.00' && !m.groups.amount) continue;
    const payee = stripCitySuffix((m.groups.payee || '').trim());
    const fields: SmsParseFields = {
      amount,
      currency: (m.groups.currency || 'AED').toUpperCase(),
      last4: m.groups.last4 || '',
      payee,
      direction: guessDirection(text),
      date: parseDateString(text) || todayISO(),
    };
    return {
      fields,
      template,
      highlights: highlightsFromMatch(text, m, fields),
    };
  }
  return null;
}

export function guessNeedsConfirm(guess: SmsGuess): boolean {
  return guess.confidence === 'weak' || !guess.fields.amount || !guess.fields.payee;
}
