'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

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

export default function Home() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [convertedData, setConvertedData] = useState<YNABTransaction[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const autoDownloadTriggerRef = useRef(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

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
    setConvertedData([]); // Clear previous results

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: '' });

      if (rows.length === 0) throw new Error('Sheet is empty or could not be read.');

      const targetHeaders: { key: keyof BankTransaction | 'DebitCredit', variations: string[] }[] = [
        { key: 'Date', variations: ['Date'] },
        { key: 'Details', variations: ['Details', 'Transaction Details'] },
        { key: 'Description', variations: ['Description', 'Memo', 'Narrative'] },
        { key: 'Amount', variations: ['Amount', 'Amount ', 'Transaction Amount'] }, // Note "Amount " with space
        { key: 'DebitCredit', variations: ['Debit/Credit', 'Debit Credit', 'Transaction Type', 'Cr/Dr'] },
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
      setConvertedData(ynabData);
      if (ynabData.length > 0) {
        autoDownloadTriggerRef.current = true;
      }

    } catch (error: unknown) {
      console.error('Error processing file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error processing file. Please make sure it\'s a valid Excel file with expected columns.';
      alert(errorMessage);
      setConvertedData([]);
    } finally {
      setIsProcessing(false);
    }
  }, [convertToYNABFormat]);

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
    
    const csv = Papa.unparse(convertedData, { header: true }); // Ensure headers are included in CSV
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

  }, [convertedData, fileName]);

  useEffect(() => {
    if (convertedData.length > 0 && autoDownloadTriggerRef.current) {
      downloadCSV();
      autoDownloadTriggerRef.current = false;
    }
  }, [convertedData, downloadCSV]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showToast) {
      timer = setTimeout(() => {
        setShowToast(false);
      }, 3000);
    }
    return () => clearTimeout(timer); // Cleanup timer on unmount or if showToast changes
  }, [showToast]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center py-8">
      <div className="container mx-auto px-4 w-full max-w-5xl">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-800 mb-3">
            Bank Excel to YNAB CSV
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Easily convert your bank&apos;s Excelss transaction files into YNAB-ready CSV format.
          </p>
        </div>

        {/* Upload Area */}
        <div className="w-full max-w-2xl mx-auto mb-8 bg-white p-8 rounded-xl shadow-2xl">
          <div
            className={`border-2 border-dashed rounded-lg p-8 sm:p-12 text-center transition-all duration-300 ease-in-out ${
              isDragOver
                ? 'border-blue-600 bg-blue-50 ring-4 ring-blue-200'
                : 'border-gray-300 hover:border-blue-400'
            }`}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center py-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-700 font-medium">Processing: {fileName || 'your file'}...</p>
              </div>
            ) : (
              <>
                <div className="mb-4 text-blue-500">
                  <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                     <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6M12 10v6" /> 
                  </svg>
                </div>
                <p className="text-xl font-semibold text-gray-700 mb-2">
                  Drop your Excel file here
                </p>
                <p className="text-gray-500 mb-6">
                  or click to select a file
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileInput}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer transition-colors duration-200"
                >
                  <svg className="w-5 h-5 mr-2 -ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  Choose File
                </label>
              </>
            )}
          </div>
        </div>

        {/* Results & Download Button */}
        {convertedData.length > 0 && !isProcessing && (
          <div className="w-full max-w-6xl mx-auto">
            <div className="bg-white rounded-xl shadow-2xl p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">
                  Converted Transactions <span className="text-gray-500">({convertedData.length})</span>
                </h2>
                <button
                  onClick={downloadCSV}
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200 w-full sm:w-auto"
                >
                  <svg className="w-5 h-5 mr-2 -ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  Download YNAB CSV Again
                </button>
              </div>

              {/* Preview Table */}
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(convertedData[0] || {}).map(key => (
                         <th key={key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {convertedData.slice(0, 10).map((transaction, index) => (
                      <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors duration-150`}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{transaction.Date}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{transaction.Payee}</td>
                        <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate" title={transaction.Memo}>{transaction.Memo}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">{transaction.Outflow}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">{transaction.Inflow}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {convertedData.length > 10 && (
                <p className="text-center text-sm text-gray-500 mt-4">
                  Previewing first 10 of {convertedData.length} transactions. Full data in downloaded CSV.
                </p>
              )}
            </div>
          </div>
        )}
        
        {/* Instructions & Info Section */}
        <div className="max-w-4xl mx-auto mt-12 text-center">
            <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8">
                 <h3 className="text-xl font-semibold text-gray-800 mb-4">Mapping Logic</h3>
                 <div className="text-sm text-gray-600 space-y-3 md:flex md:space-y-0 md:space-x-6 justify-around">
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium text-gray-700 mb-1">Bank Excel Columns (Expected)</h4>
                        <ul className="list-disc list-inside text-left space-y-1">
                            <li>Date (e.g., &quot;2023-05-26&quot; or &quot;26 May 2023&quot;)</li>
                            <li>Details (Payee name)</li>
                            <li>Description (Transaction memo)</li>
                            <li>Amount (e.g., 100.50)</li>
                            <li>Debit/Credit (or similar, e.g., &quot;DR&quot;, &quot;CR&quot;, &quot;Debit&quot;, &quot;Credit&quot;)</li>
                        </ul>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium text-gray-700 mb-1">Converted to YNAB CSV Columns</h4>
                        <ul className="list-disc list-inside text-left space-y-1">
                            <li>Date (YYYY-MM-DD)</li>
                            <li>Payee</li>
                            <li>Memo</li>
                            <li>Outflow (for debits)</li>
                            <li>Inflow (for credits)</li>
                        </ul>
                    </div>
                </div>
                <p className="mt-6 text-xs text-gray-500">
                    The converter attempts to find these columns automatically. Ensure your Excel file has clear headers.
                    The app processes data starting from the row after the identified headers.
                </p>
            </div>
        </div>

      </div>

      {/* Toast Notification */}
      {showToast && (
        <div 
          className="fixed bottom-5 right-5 bg-green-500 text-white py-3 px-6 rounded-lg shadow-lg transition-opacity duration-300 ease-in-out animate-fadeInUp"
          role="alert"
        >
          <div className="flex items-center">
            <svg className="w-6 h-6 mr-2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
