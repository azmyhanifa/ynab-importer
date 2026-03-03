const STRIP_TOKENS = new Set([
  'LLC', 'LTD', 'LIMITED', 'CO', 'CORP', 'CORPORATION', 'INC', 'INCORPORATED',
  'GULF', 'UAE', 'DUBAI', 'SHARJAH', 'ABUDHABI', 'ABU', 'DHABI', 'AJMAN',
  'FZ', 'FZCO', 'FZLLC', 'BR', 'BRANCH',
  'EST', 'ESTABLISHMENT', 'GROUP', 'GRP',
  'TRADING', 'TRADE', 'SERVICES', 'SERVICE', 'SVC',
  'INTERNATIONAL', 'INTL', 'GLOBAL',
  'RESTAURANT', 'RESTAURANTS', 'REST',
  'CAFE', 'COFFEE',
  'PVT', 'PRIVATE', 'PUBLIC', 'PLC',
  'THE', 'AND', 'OF',
]);

export type MatchMethod = 'exact' | 'normalized' | 'contains' | 'wordOverlap' | 'fuzzy' | 'none';

export interface MatchResult {
  payee: string;
  confidence: number;
  method: MatchMethod;
  originalBankName: string;
}

export type ConfidenceTier = 'high' | 'medium' | 'low' | 'none';

export function getConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.6) return 'medium';
  if (confidence > 0) return 'low';
  return 'none';
}

function normalize(name: string): string {
  let n = name.toUpperCase().trim();
  n = n.replace(/[^A-Z0-9\s]/g, ' ');
  n = n
    .split(/\s+/)
    .filter(word => word.length > 0 && !STRIP_TOKENS.has(word))
    .join(' ')
    .trim();
  return n;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = new Uint16Array((m + 1) * (n + 1));
  for (let i = 0; i <= m; i++) dp[i * (n + 1)] = i;
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i * (n + 1) + j] =
        a[i - 1] === b[j - 1]
          ? dp[(i - 1) * (n + 1) + (j - 1)]
          : 1 + Math.min(
              dp[(i - 1) * (n + 1) + j],
              dp[i * (n + 1) + (j - 1)],
              dp[(i - 1) * (n + 1) + (j - 1)],
            );
    }
  }
  return dp[m * (n + 1) + n];
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function getSignificantWords(norm: string): string[] {
  return norm.split(' ').filter(w => w.length > 1);
}

export function findBestMatch(bankName: string, ynabPayees: string[]): MatchResult {
  const noMatch: MatchResult = {
    payee: bankName,
    confidence: 0,
    method: 'none',
    originalBankName: bankName,
  };

  if (!ynabPayees.length || !bankName.trim()) return noMatch;

  const bankLower = bankName.toLowerCase().trim();
  const bankNorm = normalize(bankName);
  const bankWords = getSignificantWords(bankNorm);

  let best: MatchResult = noMatch;

  const update = (candidate: MatchResult) => {
    if (candidate.confidence > best.confidence) best = candidate;
  };

  for (const payee of ynabPayees) {
    const payeeLower = payee.toLowerCase().trim();
    const payeeNorm = normalize(payee);

    // 1. Exact match (case-insensitive on original strings)
    if (bankLower === payeeLower) {
      return { payee, confidence: 1.0, method: 'exact', originalBankName: bankName };
    }

    // 2. Normalized exact — "Noon Food LLC" → "NOON FOOD" === "Noon Food" → "NOON FOOD"
    if (payeeNorm.length > 0 && bankNorm === payeeNorm) {
      update({ payee, confidence: 0.95, method: 'normalized', originalBankName: bankName });
    }

    // 3. Contains: YNAB payee name inside bank name (after normalization)
    if (payeeNorm.length >= 3 && bankNorm.includes(payeeNorm)) {
      const ratio = payeeNorm.length / bankNorm.length;
      update({ payee, confidence: 0.8 + ratio * 0.14, method: 'contains', originalBankName: bankName });
    }

    // 4. Contains: bank name inside YNAB payee
    if (bankNorm.length >= 3 && payeeNorm.includes(bankNorm)) {
      const ratio = bankNorm.length / payeeNorm.length;
      update({ payee, confidence: 0.75 + ratio * 0.15, method: 'contains', originalBankName: bankName });
    }

    // 5. Word overlap — all YNAB payee words present in bank name (or vice versa)
    const payeeWords = getSignificantWords(payeeNorm);
    if (bankWords.length > 0 && payeeWords.length > 0) {
      const payeeWordSet = new Set(payeeWords);
      const bankWordSet = new Set(bankWords);
      const commonFromBank = bankWords.filter(w => payeeWordSet.has(w)).length;
      const commonFromPayee = payeeWords.filter(w => bankWordSet.has(w)).length;

      // If all YNAB payee words appear in bank name → high confidence
      if (commonFromPayee === payeeWords.length && payeeWords.length >= 1) {
        const ratio = payeeWords.length / Math.max(bankWords.length, payeeWords.length);
        update({ payee, confidence: 0.85 + ratio * 0.09, method: 'wordOverlap', originalBankName: bankName });
      }
      // If all bank words appear in payee words
      else if (commonFromBank === bankWords.length && bankWords.length >= 1) {
        const ratio = bankWords.length / Math.max(bankWords.length, payeeWords.length);
        update({ payee, confidence: 0.82 + ratio * 0.08, method: 'wordOverlap', originalBankName: bankName });
      }
      // Partial overlap
      else if (commonFromBank > 0) {
        const overlap = Math.max(commonFromBank, commonFromPayee) / Math.max(bankWords.length, payeeWords.length);
        update({ payee, confidence: 0.5 + overlap * 0.35, method: 'wordOverlap', originalBankName: bankName });
      }
    }

    // 6. Fuzzy (Levenshtein)
    if (bankNorm.length >= 4 && payeeNorm.length >= 4) {
      const sim = stringSimilarity(bankNorm, payeeNorm);
      if (sim > 0.72) {
        update({ payee, confidence: sim * 0.85, method: 'fuzzy', originalBankName: bankName });
      }
    }
  }

  return best;
}

export function matchAll(bankPayees: string[], ynabPayees: string[]): MatchResult[] {
  return bankPayees.map(name => findBestMatch(name, ynabPayees));
}
