'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { matchAll, type MatchResult, getConfidenceTier } from './lib/merchantMatcher';

const YNAB_API_BASE = 'https://api.ynab.com/v1';
const YNAB_API_KEY_STORAGE = 'ynab_api_key';
const YNAB_BUDGET_ID_STORAGE = 'ynab_budget_id';
const YNAB_PAYEE_MAPPINGS_STORAGE = 'ynab_payee_mappings';

function loadSavedMappings(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(YNAB_PAYEE_MAPPINGS_STORAGE) || '{}');
  } catch {
    return {};
  }
}

function saveMappings(mappings: Record<string, string>) {
  localStorage.setItem(YNAB_PAYEE_MAPPINGS_STORAGE, JSON.stringify(mappings));
}

const YNAB_INTERNAL_PAYEE_PREFIXES = [
  'Transfer :',
  'Starting Balance',
  'Manual Balance Adjustment',
  'Reconciliation Balance Adjustment',
];

const isInternalPayee = (name: string) =>
  YNAB_INTERNAL_PAYEE_PREFIXES.some(prefix => name.startsWith(prefix));

const EXCLUDED_STATUSES = new Set([
  'cancelled', 'canceled', 'cancel',
  'reversed', 'reverse', 'reversal',
  'declined', 'decline',
  'failed', 'failure',
  'rejected', 'reject',
  'void', 'voided',
  'returned', 'return',
  'bounced',
  'expired',
  'pending reversal',
]);

function isBadStatus(status: string): boolean {
  return EXCLUDED_STATUSES.has(status.toLowerCase().trim());
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  settled:    { label: 'Settled',    color: 'bg-green-100 text-green-700' },
  cleared:    { label: 'Cleared',    color: 'bg-green-100 text-green-700' },
  posted:     { label: 'Posted',     color: 'bg-green-100 text-green-700' },
  completed:  { label: 'Completed',  color: 'bg-green-100 text-green-700' },
  authorized: { label: 'Auth',       color: 'bg-blue-100 text-blue-700' },
  pending:    { label: 'Pending',    color: 'bg-amber-100 text-amber-700' },
  processing: { label: 'Processing', color: 'bg-amber-100 text-amber-700' },
  cancelled:  { label: 'Cancelled',  color: 'bg-red-100 text-red-600' },
  canceled:   { label: 'Cancelled',  color: 'bg-red-100 text-red-600' },
  reversed:   { label: 'Reversed',   color: 'bg-red-100 text-red-600' },
  reversal:   { label: 'Reversed',   color: 'bg-red-100 text-red-600' },
  declined:   { label: 'Declined',   color: 'bg-red-100 text-red-600' },
  failed:     { label: 'Failed',     color: 'bg-red-100 text-red-600' },
  rejected:   { label: 'Rejected',   color: 'bg-red-100 text-red-600' },
  void:       { label: 'Void',       color: 'bg-red-100 text-red-600' },
  voided:     { label: 'Void',       color: 'bg-red-100 text-red-600' },
  returned:   { label: 'Returned',   color: 'bg-red-100 text-red-600' },
  bounced:    { label: 'Bounced',    color: 'bg-red-100 text-red-600' },
  expired:    { label: 'Expired',    color: 'bg-red-100 text-red-600' },
};

function getStatusBadge(status: string) {
  return STATUS_BADGE[status.toLowerCase().trim()] ?? { label: status, color: 'bg-gray-100 text-gray-500' };
}

interface YNABBudget {
  id: string;
  name: string;
  last_modified_on: string;
  currency_format: {
    iso_code: string;
    symbol: string;
  };
}

interface YNABAccount {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  deleted: boolean;
}

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

interface BankTransaction {
  Date: string | Date | number | null | undefined; // Allow for Date objects or Excel date numbers
  Details: string;
  Description: string;
  Amount: number;
  Currency: string;
  Balance: number;
  'Debit/Credit': string;
  Status: string;
}

interface YNABTransaction {
  Date: string;
  Payee: string;
  Memo: string;
  Outflow: string;
  Inflow: string;
}

interface ColumnMapping {
  ynabColumn: string;
  bankColumn: string;
}

export default function Home() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [convertedData, setConvertedData] = useState<YNABTransaction[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // YNAB API state
  const [showYnabMenu, setShowYnabMenu] = useState(false);
  const [ynabApiKey, setYnabApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [ynabConnecting, setYnabConnecting] = useState(false);
  const [ynabConnected, setYnabConnected] = useState(false);
  const [ynabBudgets, setYnabBudgets] = useState<YNABBudget[]>([]);
  const [ynabError, setYnabError] = useState('');
  const [selectedBudgetId, setSelectedBudgetId] = useState('');
  const [ynabPayees, setYnabPayees] = useState<string[]>([]);
  const [ynabPayeeIdMap, setYnabPayeeIdMap] = useState<Record<string, string>>({});
  const [ynabPayeesLoading, setYnabPayeesLoading] = useState(false);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [overriddenPayees, setOverriddenPayees] = useState<Record<number, string>>({});
  const [transactionStatuses, setTransactionStatuses] = useState<string[]>([]);
  const [editingPayeeIndex, setEditingPayeeIndex] = useState<number | null>(null);
  const [payeeSearch, setPayeeSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const payeeSearchRef = useRef<HTMLInputElement>(null);
  const ynabMenuRef = useRef<HTMLDivElement>(null);

  // Row selection
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // Push to YNAB state
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushAccounts, setPushAccounts] = useState<YNABAccount[]>([]);
  const [pushAccountsLoading, setPushAccountsLoading] = useState(false);
  const [selectedPushAccountId, setSelectedPushAccountId] = useState('');
  const [isPushing, setIsPushing] = useState(false);
  const [forcePush, setForcePush] = useState(false);
  const [pushResult, setPushResult] = useState<{
    pushed: number;
    duplicates: number;
    errors: string[];
  } | null>(null);

  const columnMappings: ColumnMapping[] = [
    { ynabColumn: 'Date', bankColumn: 'Date' },
    { ynabColumn: 'Payee', bankColumn: 'Details' },
    { ynabColumn: 'Memo', bankColumn: 'Description' },
    { ynabColumn: 'Amount', bankColumn: 'Amount' },
    { ynabColumn: 'Debit/Credit', bankColumn: 'Debit/Credit' },
  ];

  const formatDate = (dateInput: string | Date | number | null | undefined): string => {
    if (dateInput === null || dateInput === undefined) return '';
    let date: Date;

    if (dateInput instanceof Date) {
        date = dateInput;
    } else if (typeof dateInput === 'string') {
        const dateStr = dateInput.trim();
        if (!dateStr) return '';
        date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            const parts = dateStr.split(/[\s-/]+/); 
            if (parts.length === 3) {
                const day = parts[0];
                const monthStr = parts[1];
                const year = parts[2];
                const months: { [key: string]: string } = {
                    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
                };
                const monthNum = months[monthStr as keyof typeof months] || months[monthStr?.charAt(0).toUpperCase() + monthStr?.slice(1).toLowerCase() as keyof typeof months];
                if (monthNum && /^\d{1,2}$/.test(day) && /^\d{4}$/.test(year)) {
                    const isoStr = `${year}-${monthNum}-${day.padStart(2, '0')}T00:00:00`;
                    date = new Date(isoStr);
                }
            }
        }
    } else if (typeof dateInput === 'number') {
        // Handle Excel serial date numbers (days since 1899-12-30 or 1904-01-01 for Mac)
        // cellDates: true should ideally handle this, but this is a fallback.
        if (dateInput > 0 && dateInput < 200000) { // Heuristic for Excel date numbers
            const excelEpoch = Date.UTC(1899, 11, 30); // Excel's epoch (Windows)
            // XLSX uses 1899-12-30 as day 0, not 1. So dateInput 1 is 1899-12-31.
            // JS Date month is 0-indexed. Excel is 1-indexed.
            date = new Date(excelEpoch + (dateInput -1) * 24 * 60 * 60 * 1000);
        } else {
            date = new Date(dateInput); // Assume timestamp in ms if not an Excel serial or already a Date object
        }
    } else {
        return String(dateInput || ''); // Fallback for unknown types
    }

    if (!date || isNaN(date.getTime())) {
        console.warn("Could not parse date:", dateInput);
        return typeof dateInput === 'string' ? dateInput.trim() : String(dateInput);
    }

    const fYear = date.getFullYear();
    const fMonth = (date.getMonth() + 1).toString().padStart(2, '0');
    const fDay = date.getDate().toString().padStart(2, '0');
    return `${fYear}-${fMonth}-${fDay}`;
  };

  const convertToYNABFormat = (bankData: BankTransaction[]): YNABTransaction[] => {
    return bankData.map(transaction => {
      const isCredit = transaction['Debit/Credit']?.toLowerCase().includes('credit');
      const amount = Math.abs(transaction.Amount || 0).toFixed(2);
      
      return {
        Date: formatDate(transaction.Date),
        Payee: transaction.Details || '',
        Memo: transaction.Description || '',
        Outflow: isCredit ? '' : amount,
        Inflow: isCredit ? amount : ''
      };
    });
  };

  const displayToast = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
  };

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setFileName(file.name);
    setConvertedData([]);
    setOverriddenPayees({});
    setMatchResults([]);
    setTransactionStatuses([]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: '' });

      if (rows.length === 0) throw new Error('Sheet is empty or could not be read.');

      const targetHeaders: { key: keyof BankTransaction | 'DebitCredit', variations: string[] }[] = [
        { key: 'Date', variations: [columnMappings.find(m => m.ynabColumn === 'Date')?.bankColumn || 'Date'] },
        { key: 'Details', variations: [columnMappings.find(m => m.ynabColumn === 'Payee')?.bankColumn || 'Details', 'Transaction Details'] },
        { key: 'Description', variations: [columnMappings.find(m => m.ynabColumn === 'Memo')?.bankColumn || 'Description', 'Memo', 'Narrative'] },
        { key: 'Amount', variations: [columnMappings.find(m => m.ynabColumn === 'Amount')?.bankColumn || 'Amount', 'Amount ', 'Transaction Amount'] }, // Note "Amount " with space
        { key: 'DebitCredit', variations: [columnMappings.find(m => m.ynabColumn === 'Debit/Credit')?.bankColumn || 'Debit/Credit', 'Debit Credit', 'Transaction Type', 'Cr/Dr'] },
        { key: 'Currency', variations: ['Currency', 'Curr'] },
        { key: 'Balance', variations: ['Balance', 'Running Balance'] },
        { key: 'Status', variations: ['Status', 'Transaction Status'] },
      ];

      let headerRowIndex = -1;
      let colIndexMap: Partial<Record<keyof BankTransaction | 'DebitCredit', number>> = {};
      let maxFoundHeadersInRow = 0;

      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const currentRowAsStrings = rows[i].map(cell => String(cell || '').trim());
        const tempMap: Partial<Record<keyof BankTransaction | 'DebitCredit', number>> = {};
        let foundCount = 0;

        targetHeaders.forEach(target => {
          for (const variation of target.variations) {
            const vLower = variation.toLowerCase();
            const foundIdx = currentRowAsStrings.findIndex(headerCell => headerCell.toLowerCase() === vLower);
            if (foundIdx !== -1) {
              if (tempMap[target.key] === undefined) { // Take first found variation for a given key
                tempMap[target.key] = foundIdx;
                foundCount++;
              }
              break; 
            }
          }
        });

        // Check if this row is a better candidate for the header row
        if (tempMap.Date !== undefined && tempMap.Amount !== undefined && (tempMap.DebitCredit !== undefined || (tempMap.Details !== undefined && tempMap.Description !== undefined) )) {
          if (foundCount > maxFoundHeadersInRow) {
            headerRowIndex = i;
            colIndexMap = { ...tempMap };
            maxFoundHeadersInRow = foundCount;
          }
        }
      }

      if (headerRowIndex === -1) {
        throw new Error('Could not automatically find the header row. Please ensure columns like "Date", "Amount", and "Debit/Credit" (or "Details"/"Description") are present in the first 10 rows.');
      }
      
      if (colIndexMap.Date === undefined || colIndexMap.Amount === undefined || colIndexMap.DebitCredit === undefined) {
        const missing: string[] = [];
        if (colIndexMap.Date === undefined) missing.push('"Date"');
        if (colIndexMap.Amount === undefined) missing.push('"Amount"');
        if (colIndexMap.DebitCredit === undefined) missing.push('"Debit/Credit" or similar type indicator');
        throw new Error(`Essential headers not found in the identified header row: ${missing.join(', ')}. Please check your Excel file structure.`);
      }

      const bankTransactions: BankTransaction[] = [];
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const dataRow = rows[i];
        if (!dataRow || dataRow.every(cell => String(cell || '').trim() === '')) continue;

        const dateValRaw = (colIndexMap.Date !== undefined ? dataRow[colIndexMap.Date] : null) as string | Date | number | null | undefined;
        const amountStr = colIndexMap.Amount !== undefined ? String(dataRow[colIndexMap.Amount] || '').trim() : '';
        const debitCreditVal = colIndexMap.DebitCredit !== undefined ? String(dataRow[colIndexMap.DebitCredit] || '').trim() : '';

        // Check for and handle empty objects that might come from empty but formatted date cells
        let dateVal: string | Date | number | null | undefined = dateValRaw;
        if (typeof dateValRaw === 'object' && dateValRaw !== null && !(dateValRaw instanceof Date) && Object.keys(dateValRaw).length === 0) {
            dateVal = null; 
        }

        if (dateVal === null || dateVal === undefined || amountStr === '' || debitCreditVal === '') {
          console.warn('Skipping row due to missing essential data (Date, Amount, or Debit/Credit type):', dataRow, {dateVal, amountStr, debitCreditVal});
          continue;
        }
        
        const amountNum = parseFloat(amountStr.replace(/[^\d.-]/g, '')); // Clean string before parsing
        if (isNaN(amountNum)) {
            console.warn(`Skipping row due to non-numeric or unparsable Amount ('${amountStr}'):`, dataRow);
            continue;
        }

        const transaction: BankTransaction = {
          Date: dateVal, // dateVal is now correctly typed string | Date | number | null | undefined
          Details: colIndexMap.Details !== undefined ? String(dataRow[colIndexMap.Details] || '') : '',
          Description: colIndexMap.Description !== undefined ? String(dataRow[colIndexMap.Description] || '') : '',
          Amount: amountNum,
          Currency: colIndexMap.Currency !== undefined ? String(dataRow[colIndexMap.Currency] || 'AED') : 'AED',
          Balance: colIndexMap.Balance !== undefined ? parseFloat(String(dataRow[colIndexMap.Balance] || '0').replace(/[^\d.-]/g, '')) : 0,
          'Debit/Credit': debitCreditVal,
          Status: colIndexMap.Status !== undefined ? String(dataRow[colIndexMap.Status] || '') : '',
        };
        bankTransactions.push(transaction);
      }
      
      if (bankTransactions.length === 0) {
        alert("No valid transactions found after parsing headers. Please check the file content and structure, especially data rows.");
        setIsProcessing(false);
        return;
      }

      const ynabData = convertToYNABFormat(bankTransactions);
      const statuses = bankTransactions.map(t => t.Status || '');
      setConvertedData(ynabData);
      setTransactionStatuses(statuses);

      // Select all except rows with bad statuses
      const initialSelected = new Set(
        ynabData.map((_, i) => i).filter(i => !isBadStatus(statuses[i]))
      );
      setSelectedRows(initialSelected);

      // Auto-apply saved payee mappings
      const saved = loadSavedMappings();
      const autoOverrides: Record<number, string> = {};
      ynabData.forEach((t, i) => {
        if (t.Payee && saved[t.Payee]) {
          autoOverrides[i] = saved[t.Payee];
        }
      });
      setOverriddenPayees(autoOverrides);

    } catch (error: unknown) {
      console.error('Error processing file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error processing file. Please make sure it\'s a valid Excel file with expected columns.';
      alert(errorMessage);
      setConvertedData([]);
    } finally {
      setIsProcessing(false);
    }
  }, [convertToYNABFormat, columnMappings]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const excelFile = files.find(file => 
      file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    );
    
    if (excelFile) {
      processFile(excelFile);
    } else {
      displayToast('Please upload an Excel file (.xlsx or .xls)');
    }
  }, [processFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const downloadCSV = useCallback(() => {
    if (convertedData.length === 0) return;

    const exportData = convertedData
      .map((t, i) => {
        if (!selectedRows.has(i)) return null;
        const override = overriddenPayees[i];
        const match = matchResults[i];
        const payee =
          override !== undefined
            ? override
            : match && match.confidence >= 0.6
              ? match.payee
              : t.Payee;
        return { ...t, Payee: payee };
      })
      .filter(Boolean);

    const csv = Papa.unparse(exportData, { header: true });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const ynabFileName = `ynab_import_${fileName.replace(/\.(xlsx|xls)$/i, '')}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', ynabFileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    displayToast(`Successfully downloaded ${ynabFileName}`);
  }, [convertedData, matchResults, fileName]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showToast) {
      timer = setTimeout(() => {
        setShowToast(false);
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [showToast]);

  // Auto-connect and restore last budget on mount
  useEffect(() => {
    const storedKey = localStorage.getItem(YNAB_API_KEY_STORAGE);
    const storedBudgetId = localStorage.getItem(YNAB_BUDGET_ID_STORAGE);
    if (!storedKey) return;

    setYnabApiKey(storedKey);
    setYnabConnecting(true);

    (async () => {
      try {
        const res = await fetch(`${YNAB_API_BASE}/budgets`, {
          headers: { Authorization: `Bearer ${storedKey}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        const budgets: YNABBudget[] = data.data?.budgets ?? [];
        setYnabBudgets(budgets);
        setYnabConnected(true);

        const targetBudgetId =
          storedBudgetId && budgets.some(b => b.id === storedBudgetId)
            ? storedBudgetId
            : null;

        if (targetBudgetId) {
          setSelectedBudgetId(targetBudgetId);
          setYnabPayeesLoading(true);
          try {
            const pRes = await fetch(`${YNAB_API_BASE}/budgets/${targetBudgetId}/payees`, {
              headers: { Authorization: `Bearer ${storedKey}` },
            });
            if (pRes.ok) {
              const pData = await pRes.json();
              const raw: { id: string; name: string; deleted: boolean }[] = (
                pData.data?.payees ?? []
              ).filter((p: { deleted: boolean }) => !p.deleted);
              setYnabPayees(raw.map(p => p.name));
              setYnabPayeeIdMap(Object.fromEntries(raw.map(p => [p.name, p.id])));
            }
          } finally {
            setYnabPayeesLoading(false);
          }
        }
      } catch (err) {
        console.error('Auto-connect failed', err);
      } finally {
        setYnabConnecting(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run merchant matching whenever transactions or payee list changes
  useEffect(() => {
    if (convertedData.length === 0 || ynabPayees.length === 0) {
      setMatchResults([]);
      return;
    }
    const results = matchAll(convertedData.map(t => t.Payee), ynabPayees);
    setMatchResults(results);
  }, [convertedData, ynabPayees]);

  const connectYNAB = async () => {
    const key = ynabApiKey.trim();
    if (!key) {
      setYnabError('Please enter an API key.');
      return;
    }
    setYnabConnecting(true);
    setYnabError('');
    setYnabConnected(false);
    setYnabBudgets([]);

    try {
      const res = await fetch(`${YNAB_API_BASE}/budgets`, {
        headers: { Authorization: `Bearer ${key}` },
      });

      if (res.status === 401) {
        setYnabError('Invalid API key — double-check it in your YNAB Developer Settings.');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setYnabError(body?.error?.detail || `API error: ${res.status}`);
        return;
      }

      const data = await res.json();
      const budgets: YNABBudget[] = data.data?.budgets ?? [];
      setYnabBudgets(budgets);
      setYnabConnected(true);
      localStorage.setItem(YNAB_API_KEY_STORAGE, key);
    } catch (err) {
      setYnabError('Network error — make sure you have internet access.');
      console.error(err);
    } finally {
      setYnabConnecting(false);
    }
  };

  const disconnectYNAB = () => {
    setYnabConnected(false);
    setYnabBudgets([]);
    setYnabError('');
    setSelectedBudgetId('');
    setYnabPayees([]);
    setYnabPayeeIdMap({});
    setMatchResults([]);
    localStorage.removeItem(YNAB_API_KEY_STORAGE);
    localStorage.removeItem(YNAB_BUDGET_ID_STORAGE);
  };

  const openPushModal = async () => {
    setPushResult(null);
    setSelectedPushAccountId('');
    setForcePush(false);
    setShowPushModal(true);
    setPushAccountsLoading(true);
    try {
      const res = await fetch(`${YNAB_API_BASE}/budgets/${selectedBudgetId}/accounts`, {
        headers: { Authorization: `Bearer ${ynabApiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        const accounts: YNABAccount[] = (data.data?.accounts ?? []).filter(
          (a: YNABAccount) => !a.deleted && !a.closed,
        );
        setPushAccounts(accounts);
      }
    } catch (err) {
      console.error('Failed to fetch accounts', err);
    } finally {
      setPushAccountsLoading(false);
    }
  };

  const pushToYNAB = async () => {
    if (!selectedPushAccountId) return;
    setIsPushing(true);

    const exportData = convertedData
      .map((t, i) => {
        if (!selectedRows.has(i)) return null;
        const override = overriddenPayees[i];
        const match = matchResults[i];
        const payee =
          override !== undefined
            ? override
            : match && match.confidence >= 0.6
              ? match.payee
              : t.Payee;
        return { ...t, Payee: payee };
      })
      .filter((t): t is YNABTransaction => t !== null);

    // Build YNAB transaction objects, optionally with import_id for duplicate detection
    const importIdCounts: Record<string, number> = {};
    const transactions = exportData.map(t => {
      const amount = t.Outflow
        ? -Math.round(parseFloat(t.Outflow) * 1000)
        : Math.round(parseFloat(t.Inflow || '0') * 1000);
      const key = `${amount}:${t.Date}`;
      importIdCounts[key] = (importIdCounts[key] || 0) + 1;
      return {
        account_id: selectedPushAccountId,
        date: t.Date,
        amount,
        payee_id: isInternalPayee(t.Payee) ? (ynabPayeeIdMap[t.Payee] ?? undefined) : undefined,
        payee_name: !isInternalPayee(t.Payee) && t.Payee ? t.Payee : undefined,
        memo: t.Memo || undefined,
        cleared: 'cleared' as const,
        approved: false,
        import_id: forcePush ? undefined : `YNAB:${amount}:${t.Date}:${importIdCounts[key]}`,
      };
    });

    try {
      const res = await fetch(`${YNAB_API_BASE}/budgets/${selectedBudgetId}/transactions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ynabApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactions }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPushResult({
          pushed: 0,
          duplicates: 0,
          errors: [data?.error?.detail ?? `API error ${res.status}`],
        });
        return;
      }

      const pushed = data.data?.transaction_ids?.length ?? 0;
      const duplicates = data.data?.duplicate_import_ids?.length ?? 0;
      setPushResult({ pushed, duplicates, errors: [] });
    } catch (err) {
      console.error('Push failed', err);
      setPushResult({ pushed: 0, duplicates: 0, errors: ['Network error — please try again.'] });
    } finally {
      setIsPushing(false);
    }
  };

  const overridePayee = useCallback((index: number, ynabPayeeName: string) => {
    const bankPayee = convertedData[index]?.Payee;

    setOverriddenPayees(prev => {
      const next = { ...prev };
      // Always set the one the user explicitly picked
      next[index] = ynabPayeeName;
      // Bulk-apply to all rows with the same original bank payee that don't already have a manual override
      if (bankPayee) {
        convertedData.forEach((t, i) => {
          if (i !== index && t.Payee === bankPayee && prev[i] === undefined) {
            next[i] = ynabPayeeName;
          }
        });
      }
      return next;
    });

    // Persist to localStorage
    if (bankPayee) {
      const saved = loadSavedMappings();
      saved[bankPayee] = ynabPayeeName;
      saveMappings(saved);
    }
  }, [convertedData]);

  const closePayeeDropdown = useCallback(() => {
    setEditingPayeeIndex(null);
    setDropdownPos(null);
  }, []);

  const selectBudget = async (budgetId: string) => {
    setSelectedBudgetId(budgetId);
    setYnabPayees([]);
    setMatchResults([]);
    if (!budgetId) {
      localStorage.removeItem(YNAB_BUDGET_ID_STORAGE);
      return;
    }
    localStorage.setItem(YNAB_BUDGET_ID_STORAGE, budgetId);

    setYnabPayeesLoading(true);
    try {
      const res = await fetch(`${YNAB_API_BASE}/budgets/${budgetId}/payees`, {
        headers: { Authorization: `Bearer ${ynabApiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        const raw: { id: string; name: string; deleted: boolean }[] =
          (data.data?.payees ?? []).filter((p: { deleted: boolean }) => !p.deleted);
        setYnabPayees(raw.map(p => p.name));
        setYnabPayeeIdMap(Object.fromEntries(raw.map(p => [p.name, p.id])));
      }
    } catch (err) {
      console.error('Failed to fetch payees', err);
    } finally {
      setYnabPayeesLoading(false);
    }
  };

  // Close YNAB menu on outside click
  useEffect(() => {
    if (!showYnabMenu) return;
    const handler = (e: MouseEvent) => {
      if (ynabMenuRef.current && !ynabMenuRef.current.contains(e.target as Node)) {
        setShowYnabMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showYnabMenu]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (editingPayeeIndex !== null) {
      setTimeout(() => payeeSearchRef.current?.focus(), 0);
    }
  }, [editingPayeeIndex]);

  // Close dropdown on outside click or scroll
  useEffect(() => {
    if (editingPayeeIndex === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-payee-dropdown]') && !target.closest('[data-payee-cell]')) {
        closePayeeDropdown();
      }
    };
    const handleScroll = () => closePayeeDropdown();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [editingPayeeIndex, closePayeeDropdown]);

  const filteredPayees = useMemo(() => {
    const q = payeeSearch.trim().toLowerCase();
    if (!q) return ynabPayees.slice(0, 10);
    return ynabPayees.filter(p => p.toLowerCase().includes(q)).slice(0, 10);
  }, [payeeSearch, ynabPayees]);

  const handlePayeeClick = (e: React.MouseEvent<HTMLTableCellElement>, index: number) => {
    if (ynabPayees.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setEditingPayeeIndex(index);
    setPayeeSearch('');
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 280),
    });
  };

  const selectedBudget = ynabBudgets.find(b => b.id === selectedBudgetId);
  const allSelected = convertedData.length > 0 && selectedRows.size === convertedData.length;

  return (
    <div className="min-h-screen bg-ynab-bg pb-[200px]">
      {/* Top nav bar */}
      <header className="bg-ynab-navy sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-white" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M12.965 7.137s.087.042.053.094L9.437 12.73a.46.46 0 0 0-.064.207v2.951c0 .06-.053.113-.114.113H6.741a.116.116 0 0 1-.114-.113v-2.95a.45.45 0 0 0-.064-.208L2.97 7.231c-.033-.052-.015-.094.05-.094h2.94c.061 0 .14.045.17.098l1.815 3.073c.034.052.083.052.117 0l1.804-3.073a.23.23 0 0 1 .173-.098zm-1.392 3.619a.26.26 0 0 1 .132-.027c1.297-.003 1.082 1.243 1.026 1.695-.442-.11-1.69-.343-1.23-1.555a.3.3 0 0 1 .072-.113m-7.278-.027c.068 0 .11.012.132.027.019.015.045.06.068.113.46 1.212-.788 1.445-1.23 1.555-.052-.452-.267-1.698 1.03-1.695m7.968-1.091q.004-.069.11-.192c1.387-1.615 2.575.06 3.035.636-.6.425-2.206 1.705-3.092-.23a.5.5 0 0 1-.053-.214m-8.522-.004a.5.5 0 0 1-.053.214c-.886 1.936-2.493.66-3.092.23.456-.572 1.644-2.247 3.035-.636a.5.5 0 0 1 .11.192m9.804-1.818a.35.35 0 0 1 .053-.155c.773-1.37 1.96-.395 2.402-.064-.377.4-1.373 1.57-2.376.362a.4.4 0 0 1-.079-.143m-11.09-.004a.4.4 0 0 1-.08.143C1.374 9.167.378 7.996 0 7.59c.441-.328 1.629-1.303 2.402.067q.061.109.053.155m10.027-1.664a.46.46 0 0 1-.023-.219c.155-2.12 2.108-1.48 2.813-1.29-.226.696-.754 2.68-2.62 1.648a.5.5 0 0 1-.17-.14m-8.964.004c-.019.037-.09.086-.17.139C1.483 7.319.955 5.338.725 4.64c.709-.191 2.659-.831 2.817 1.292a.5.5 0 0 1-.023.219m8.768-1.97c-.068-.003-.132-.01-.159-.03-.022-.015-.053-.06-.083-.139-.558-1.468.954-1.75 1.49-1.882.064.546.324 2.06-1.248 2.052m-8.413-.026a.5.5 0 0 1-.159.03c-1.576.008-1.312-1.506-1.248-2.048.536.128 2.044.41 1.49 1.883q-.042.106-.083.135m4.121-1.23a.6.6 0 0 1-.188-.076C6.15 1.792 7.53.49 7.994 0c.468.49 1.848 1.788.189 2.85a.4.4 0 0 1-.189.075m2.165.786a.5.5 0 0 1-.181.008c-.03-.012-.076-.053-.128-.125-1.003-1.45.565-2.164 1.112-2.45.219.575.909 2.15-.803 2.567m-4.137.008c-.034.015-.105.007-.18-.008-1.713-.418-1.019-1.992-.804-2.571.547.286 2.115 1.001 1.112 2.45q-.075.113-.128.129m1.829 2.063c-1.297-.889-.219-1.984.147-2.395.366.41 1.444 1.506.147 2.395a.3.3 0 0 1-.147.064.4.4 0 0 1-.147-.064m2.09.933a.6.6 0 0 1-.22-.045c-.037-.023-.083-.083-.12-.18-.856-1.95 1.169-2.293 1.885-2.455.125.719.585 2.722-1.546 2.68m-1.947 1.97a.4.4 0 0 1-.147-.065c-1.297-.892-.215-1.984.147-2.394.366.41 1.445 1.502.147 2.394a.3.3 0 0 1-.147.064M6.282 6.67a.6.6 0 0 1-.218.045c-2.13.042-1.67-1.957-1.543-2.68.717.162 2.742.504 1.886 2.454a.46.46 0 0 1-.125.181"/>
            </svg>
            <h1 className="text-white uppercase" style={{ fontWeight: 900, fontSize: 20, letterSpacing: 0 }}>YNAB Importer</h1>
          </div>

          {/* YNAB connection dropdown */}
          <div className="relative" ref={ynabMenuRef}>
            <button
              onClick={() => setShowYnabMenu(v => !v)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <div className="text-right">
                <span className="block text-white font-semibold text-sm max-w-[180px] truncate leading-tight">
                  {ynabConnecting
                    ? 'Connecting…'
                    : ynabConnected
                      ? selectedBudget?.name ?? 'Select budget'
                      : 'Connect to YNAB'}
                </span>
                {ynabConnected && (
                  <span className="flex items-center gap-1 justify-end">
                    <span className={`w-1.5 h-1.5 rounded-full ${ynabConnecting ? 'bg-amber-400 animate-pulse' : 'bg-ynab-green'}`} />
                    <span className="text-[10px] text-white/50">Connected</span>
                  </span>
                )}
              </div>
              <svg className={`w-3 h-3 text-white/40 transition-transform ${showYnabMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showYnabMenu && (
              <div className="absolute right-0 mt-2 w-80 bg-ynab-purple rounded-xl shadow-2xl border border-white/10 overflow-hidden animate-fadeInUp">
                {!ynabConnected ? (
                  <div className="p-4 space-y-3">
                    <p className="text-white/70 text-xs">
                      Paste your{' '}
                      <a href="https://app.ynab.com/settings/developer" target="_blank" rel="noopener noreferrer" className="text-ynab-green hover:underline">
                        Personal Access Token
                      </a>
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={ynabApiKey}
                          onChange={(e) => { setYnabApiKey(e.target.value); setYnabError(''); }}
                          onKeyDown={(e) => e.key === 'Enter' && connectYNAB()}
                          placeholder="API key…"
                          className="w-full px-3 py-2 pr-8 bg-white/10 border border-white/20 rounded-lg text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-ynab-green font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(v => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                          tabIndex={-1}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {showApiKey ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18" />
                            ) : (
                              <>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </>
                            )}
                          </svg>
                        </button>
                      </div>
                      <button
                        onClick={connectYNAB}
                        disabled={ynabConnecting || !ynabApiKey.trim()}
                        className="px-3 py-2 bg-ynab-green text-white text-xs font-semibold rounded-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                      >
                        {ynabConnecting ? '…' : 'Connect'}
                      </button>
                    </div>
                    {ynabError && (
                      <p className="text-xs text-red-400">{ynabError}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    {/* Connected header */}
                    <div className="px-4 pt-4 pb-3 border-b border-white/10">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-ynab-green" />
                        <span className="text-white/90 text-sm font-medium">Connected</span>
                      </div>
                      <select
                        value={selectedBudgetId}
                        onChange={(e) => selectBudget(e.target.value)}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-ynab-green appearance-none cursor-pointer"
                      >
                        <option value="" className="bg-ynab-purple text-white">— Select a budget —</option>
                        {ynabBudgets.map((b) => (
                          <option key={b.id} value={b.id} className="bg-ynab-purple text-white">
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Payee status */}
                    <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                      {ynabPayeesLoading ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/20 border-t-ynab-green rounded-full animate-spin" />
                          <span className="text-white/50 text-xs">Loading payees…</span>
                        </>
                      ) : ynabPayees.length > 0 ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-ynab-green" />
                          <span className="text-white/60 text-xs">{ynabPayees.length} payees · matching active</span>
                        </>
                      ) : selectedBudgetId ? (
                        <span className="text-white/40 text-xs">No payees loaded</span>
                      ) : (
                        <span className="text-white/40 text-xs">Select a budget above</span>
                      )}
                    </div>

                    {/* Disconnect */}
                    <button
                      onClick={() => { disconnectYNAB(); setShowYnabMenu(false); }}
                      className="w-full px-4 py-2.5 text-left text-xs text-red-400 hover:bg-white/5 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main
        className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
        onDrop={convertedData.length > 0 ? handleDrop : undefined}
        onDragOver={convertedData.length > 0 ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsDragOver(true); } : undefined}
        onDragLeave={convertedData.length > 0 ? () => setIsDragOver(false) : undefined}
      >
        {/* Upload area — only shown when no file loaded */}
        {convertedData.length === 0 && (
          <div
            className={`rounded-lg border-2 border-dashed p-12 text-center transition-all duration-200 mb-6 ${
              isDragOver
                ? 'border-ynab-green bg-ynab-green-light'
                : 'border-ynab-border hover:border-ynab-navy/30 bg-white'
            }`}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-ynab-navy/20 border-t-ynab-navy mb-3" />
                <p className="text-sm font-medium text-foreground">Processing {fileName}…</p>
              </div>
            ) : (
              <>
                <svg className="mx-auto h-8 w-8 text-ynab-navy/25 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="font-medium text-foreground mb-1">Drop your bank statement here</p>
                <p className="text-ynab-muted text-sm mb-5">Excel files (.xlsx, .xls)</p>
                <input type="file" accept=".xlsx,.xls" onChange={handleFileInput} className="hidden" id="file-upload" />
                <label
                  htmlFor="file-upload"
                  className="inline-flex items-center px-4 py-2 text-sm font-semibold rounded-md text-white bg-ynab-navy hover:bg-ynab-blue transition-colors cursor-pointer"
                >
                  Choose File
                </label>
              </>
            )}
          </div>
        )}

        {/* Processing overlay when replacing file */}
        {isProcessing && convertedData.length > 0 && (
          <div className="flex items-center gap-3 bg-white border border-ynab-border rounded-lg px-4 py-3 mb-4 text-sm text-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-ynab-navy/20 border-t-ynab-navy flex-shrink-0" />
            Processing {fileName}…
          </div>
        )}

        {/* Transactions table */}
        {convertedData.length > 0 && !isProcessing && (
          <div className={`bg-white rounded-lg border transition-all duration-150 overflow-hidden ${isDragOver ? 'border-ynab-green ring-2 ring-ynab-green/20' : 'border-ynab-border'}`}>

            {/* Drop-to-replace overlay */}
            {isDragOver && (
              <div className="absolute inset-0 z-10 bg-ynab-green/5 flex items-center justify-center pointer-events-none rounded-lg">
                <div className="bg-white border-2 border-ynab-green rounded-xl px-6 py-4 shadow-lg text-center">
                  <svg className="mx-auto h-6 w-6 text-ynab-green mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <p className="text-sm font-semibold text-ynab-navy">Drop to replace file</p>
                </div>
              </div>
            )}

            {/* Table toolbar */}
            <div className="px-4 py-3 border-b border-ynab-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                {/* File info */}
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-3.5 h-3.5 text-ynab-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-xs text-ynab-muted truncate">{fileName}</span>
                  <label htmlFor="file-replace" className="text-xs text-ynab-blue hover:underline cursor-pointer flex-shrink-0">
                    Change
                  </label>
                  <input type="file" accept=".xlsx,.xls" onChange={handleFileInput} className="hidden" id="file-replace" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground">
                    {selectedRows.size} <span className="font-normal text-ynab-muted">of {convertedData.length} transactions</span>
                  </span>
                  {matchResults.length > 0 && (
                    <span className="text-ynab-border">·</span>
                  )}
                  {matchResults.length > 0 && (() => {
                    const high = matchResults.filter(r => getConfidenceTier(r.confidence) === 'high').length;
                    const medium = matchResults.filter(r => getConfidenceTier(r.confidence) === 'medium').length;
                    const none = matchResults.filter(r => getConfidenceTier(r.confidence) === 'none').length;
                    return (
                      <div className="flex items-center gap-2.5">
                        <span className="flex items-center gap-1 text-[11px] text-ynab-muted">
                          <span className="w-1.5 h-1.5 rounded-full bg-ynab-green" />{high} matched
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-ynab-muted">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{medium} possible
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-ynab-muted">
                          <span className="w-1.5 h-1.5 rounded-full bg-ynab-border" />{none} unmatched
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={downloadCSV}
                  disabled={selectedRows.size === 0}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-md border border-ynab-border text-foreground hover:bg-ynab-bg disabled:opacity-40 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 mr-1.5 text-ynab-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download CSV
                </button>
                {ynabConnected && selectedBudgetId && (
                  <button
                    onClick={openPushModal}
                    disabled={selectedRows.size === 0}
                    className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-md text-white bg-ynab-green hover:brightness-110 disabled:opacity-40 transition-all"
                  >
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Push to YNAB
                  </button>
                )}
              </div>
            </div>

            {/* Table */}

            <div className="overflow-x-auto relative">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-ynab-bg border-b border-ynab-border">
                    <th className="w-10 px-3 py-2">
                      <button
                        onClick={() => setSelectedRows(allSelected ? new Set() : new Set(convertedData.map((_, i) => i)))}
                        className="text-[10px] font-semibold text-ynab-muted hover:text-ynab-navy transition-colors uppercase tracking-wide"
                        title={allSelected ? 'Deselect all' : 'Select all'}
                      >
                        {allSelected ? 'None' : 'All'}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-ynab-muted uppercase tracking-wider">Date</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-ynab-muted uppercase tracking-wider">Payee</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-ynab-muted uppercase tracking-wider">Memo</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold text-ynab-muted uppercase tracking-wider">Outflow</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold text-ynab-muted uppercase tracking-wider">Inflow</th>
                    {transactionStatuses.some(s => s) && (
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-ynab-muted uppercase tracking-wider">Status</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ynab-border/60">
                  {convertedData.map((transaction, index) => {
                    const override = overriddenPayees[index];
                    const match = matchResults[index];
                    const isOverridden = override !== undefined;
                    const isMatched = !isOverridden && match && match.confidence >= 0.6;
                    const displayPayee = isOverridden
                      ? override
                      : isMatched ? match.payee : transaction.Payee;
                    const tier = match ? getConfidenceTier(match.confidence) : 'none';
                    const isRowSelected = selectedRows.has(index);

                    const dotColor = isOverridden
                      ? 'bg-ynab-blue'
                      : tier === 'high' ? 'bg-ynab-green' : tier === 'medium' ? 'bg-amber-400' : 'bg-ynab-border';

                    const tooltipText = isOverridden
                      ? `Manually set · original: "${transaction.Payee}"`
                      : tier === 'none' || !match
                        ? 'No match — click to set'
                        : `${tier === 'high' ? 'Matched' : 'Possible'}: "${match.payee}" (${Math.round(match.confidence * 100)}%)`;

                    const isEditable = ynabPayees.length > 0;

                    return (
                      <tr
                        key={index}
                        className={`transition-colors group/row ${
                          isRowSelected
                            ? 'bg-white hover:bg-ynab-bg/40'
                            : 'bg-ynab-bg/30 opacity-50 hover:opacity-70'
                        }`}
                      >
                        <td className="w-10 px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={isRowSelected}
                            onChange={() => {
                              setSelectedRows(prev => {
                                const next = new Set(prev);
                                next.has(index) ? next.delete(index) : next.add(index);
                                return next;
                              });
                            }}
                            className="rounded border-ynab-border text-ynab-green focus:ring-ynab-green accent-ynab-green"
                          />
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-ynab-muted text-xs font-mono">{transaction.Date}</td>
                        <td
                          data-payee-cell
                          onClick={(e) => handlePayeeClick(e, index)}
                          className={`px-3 py-2.5 whitespace-nowrap group ${isEditable ? 'cursor-pointer' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            {matchResults.length > 0 && (
                              <span title={tooltipText} className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                            )}
                            <span className={`font-medium ${isMatched || isOverridden ? 'text-foreground' : 'text-ynab-muted'}`}>
                              {displayPayee}
                            </span>
                            {(isMatched && match.payee !== transaction.Payee) && (
                              <span className="text-[11px] text-ynab-muted/70 truncate max-w-[100px]" title={transaction.Payee}>
                                ← {transaction.Payee}
                              </span>
                            )}
                            {isEditable && (
                              <svg className="w-3 h-3 text-transparent group-hover:text-ynab-blue/40 flex-shrink-0 transition-colors ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-ynab-muted text-xs max-w-[200px] truncate" title={transaction.Memo}>{transaction.Memo}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right text-foreground font-semibold tabular-nums">{transaction.Outflow}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right text-ynab-green font-semibold tabular-nums">{transaction.Inflow}</td>
                        {transactionStatuses.some(s => s) && (
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {transactionStatuses[index] ? (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${getStatusBadge(transactionStatuses[index]).color}`}>
                                {getStatusBadge(transactionStatuses[index]).label}
                              </span>
                            ) : null}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Deselected-status footer note */}
            {(() => {
              const deselected = transactionStatuses.filter((s, i) => s && isBadStatus(s) && !selectedRows.has(i));
              if (deselected.length === 0) return null;
              const counts: Record<string, number> = {};
              deselected.forEach(s => { const l = getStatusBadge(s).label; counts[l] = (counts[l] || 0) + 1; });
              return (
                <div className="px-4 py-2.5 border-t border-ynab-border text-[11px] text-ynab-muted">
                  {Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(', ')} deselected by default — check rows to include.
                </div>
              );
            })()}
          </div>
        )}
      </main>

      {/* Push to YNAB modal */}
      {showPushModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Push to YNAB</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Import transactions directly into your budget
                </p>
              </div>
              {!isPushing && (
                <button
                  onClick={() => setShowPushModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors ml-4 mt-0.5"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className="px-6 py-5 space-y-5">
              {pushResult ? (
                /* Result state */
                <div className="space-y-4">
                  {pushResult.errors.length > 0 ? (
                    <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100">
                      <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-red-700">Push failed</p>
                        {pushResult.errors.map((e, i) => (
                          <p key={i} className="text-sm text-red-600 mt-1">{e}</p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
                      <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-green-700">
                          {pushResult.pushed} transaction{pushResult.pushed !== 1 ? 's' : ''} pushed successfully
                        </p>
                        {pushResult.duplicates > 0 && (
                          <p className="text-sm text-green-600 mt-1">
                            {pushResult.duplicates} duplicate{pushResult.duplicates !== 1 ? 's' : ''} skipped (already in YNAB)
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setShowPushModal(false)}
                    className="w-full px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                /* Selection + confirm state */
                <>
                  {/* Transaction summary */}
                  {(() => {
                    const selected = convertedData.filter((_, i) => selectedRows.has(i));
                    const totalOut = selected.reduce((s, t) => s + parseFloat(t.Outflow || '0'), 0);
                    const totalIn = selected.reduce((s, t) => s + parseFloat(t.Inflow || '0'), 0);
                    return (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gray-50 rounded-xl px-4 py-3 text-center">
                          <p className="text-xs text-gray-500 mb-1">Transactions</p>
                          <p className="text-lg font-bold text-gray-900">{selectedRows.size}</p>
                        </div>
                        <div className="bg-red-50 rounded-xl px-4 py-3 text-center">
                          <p className="text-xs text-gray-500 mb-1">Total out</p>
                          <p className="text-lg font-bold text-red-600">{totalOut.toFixed(2)}</p>
                        </div>
                        <div className="bg-green-50 rounded-xl px-4 py-3 text-center">
                          <p className="text-xs text-gray-500 mb-1">Total in</p>
                          <p className="text-lg font-bold text-green-600">{totalIn.toFixed(2)}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Account selector */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Which account are these transactions for?
                    </label>
                    {pushAccountsLoading ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
                        Loading accounts…
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {pushAccounts
                          .sort((a, b) => Number(b.on_budget) - Number(a.on_budget))
                          .map((account) => (
                            <label
                              key={account.id}
                              className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-colors ${
                                selectedPushAccountId === account.id
                                  ? 'border-indigo-500 bg-indigo-50'
                                  : 'border-ynab-border hover:border-ynab-navy/30 bg-white'
                              }`}
                            >
                              <input
                                type="radio"
                                name="push-account"
                                value={account.id}
                                checked={selectedPushAccountId === account.id}
                                onChange={() => setSelectedPushAccountId(account.id)}
                                className="accent-indigo-600"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{account.name}</p>
                                <p className="text-xs text-gray-400">
                                  {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                                  {account.on_budget ? '' : ' · off-budget'}
                                </p>
                              </div>
                            </label>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Duplicate detection toggle */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative mt-0.5 flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={forcePush}
                        onChange={e => setForcePush(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-9 h-5 rounded-full transition-colors ${forcePush ? 'bg-amber-500' : 'bg-gray-200'}`} />
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${forcePush ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Skip duplicate detection</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {forcePush
                          ? 'Duplicates will NOT be checked — use this to re-import deleted transactions.'
                          : 'YNAB will skip any transaction it has seen before, even if deleted.'}
                      </p>
                    </div>
                  </label>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setShowPushModal(false)}
                      className="flex-1 px-4 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={pushToYNAB}
                      disabled={!selectedPushAccountId || isPushing}
                      className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {isPushing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Pushing…
                        </>
                      ) : (
                        <>
                          Push {selectedRows.size} transactions
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payee picker dropdown (fixed-position portal) */}
      {editingPayeeIndex !== null && dropdownPos && (
        <div
          data-payee-dropdown
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 200,
          }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Search input */}
          <div className="px-3 pt-3 pb-2 border-b border-gray-100">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={payeeSearchRef}
                value={payeeSearch}
                onChange={(e) => setPayeeSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closePayeeDropdown();
                  if (e.key === 'Enter' && filteredPayees.length === 1) {
                    overridePayee(editingPayeeIndex, filteredPayees[0]);
                    closePayeeDropdown();
                  }
                }}
                placeholder="Search payees…"
                className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Payee list */}
          <div className="max-h-52 overflow-y-auto py-1 payee-scroll">
            {filteredPayees.length > 0 ? (
              filteredPayees.map((payee) => {
                const isCurrent =
                  (overriddenPayees[editingPayeeIndex] ?? '') === payee ||
                  (!overriddenPayees[editingPayeeIndex] &&
                    matchResults[editingPayeeIndex]?.confidence >= 0.6 &&
                    matchResults[editingPayeeIndex]?.payee === payee);
                return (
                  <button
                    key={payee}
                    onClick={() => {
                      overridePayee(editingPayeeIndex, payee);
                      closePayeeDropdown();
                    }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2 ${
                      isCurrent
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>{payee}</span>
                    {isCurrent && (
                      <svg className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-3 text-sm text-gray-400 text-center">No payees found</p>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">{ynabPayees.length} payees total</span>
            <button
              onClick={closePayeeDropdown}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel (Esc)
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {showToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ynab-navy text-white py-2.5 px-5 rounded-lg shadow-xl animate-fadeInUp text-sm flex items-center gap-2" role="alert">
          <svg className="w-4 h-4 text-ynab-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
