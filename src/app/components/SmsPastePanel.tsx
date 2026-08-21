'use client';

import { useEffect, useRef, useState } from 'react';

export default function ClipboardPasteButton({
  onPasteText,
  compact = false,
  disabled = false,
  className = '',
}: {
  onPasteText: (text: string) => void;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [catcherOpen, setCatcherOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!catcherOpen) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [catcherOpen]);

  const ingest = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    setCatcherOpen(false);
    onPasteText(trimmed);
    return true;
  };

  const handleClick = async () => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      const text = await navigator.clipboard.readText();
      if (ingest(text)) return;
      setCatcherOpen(true);
    } catch {
      setCatcherOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const buttonClass = compact
    ? 'inline-flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-md border border-ynab-border text-foreground hover:bg-ynab-bg disabled:opacity-40 transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0'
    : 'inline-flex items-center justify-center px-4 py-2.5 sm:py-2 text-sm font-semibold rounded-md border border-ynab-border text-ynab-navy bg-white hover:bg-ynab-bg disabled:opacity-40 transition-colors whitespace-nowrap min-h-[44px]';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        className={`${buttonClass} ${className}`}
      >
        <svg
          className={compact ? 'w-3.5 h-3.5 mr-1.5 text-ynab-muted' : 'w-4 h-4 mr-1.5 text-ynab-navy/70'}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        {busy ? 'Pasting…' : (
          <>
            <span className="sm:hidden">{compact ? 'Paste' : 'Paste from clipboard'}</span>
            <span className="hidden sm:inline">Paste from clipboard</span>
          </>
        )}
      </button>

      {catcherOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Paste now</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Clipboard access was blocked. Paste your bank SMS here.
              </p>
            </div>
            <div className="px-5 py-4">
              <textarea
                ref={inputRef}
                rows={4}
                placeholder="Paste a bank SMS — or several, separated by a blank line"
                className="w-full resize-y rounded-lg border border-ynab-border bg-white px-3 py-2 text-base text-foreground placeholder:text-ynab-muted focus:outline-none focus:ring-2 focus:ring-ynab-green min-h-[96px]"
                onPaste={e => {
                  const text = e.clipboardData.getData('text');
                  if (text.trim()) {
                    e.preventDefault();
                    ingest(text);
                  }
                }}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    ingest((e.target as HTMLTextAreaElement).value);
                  }
                }}
              />
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button
                type="button"
                onClick={() => setCatcherOpen(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => ingest(inputRef.current?.value ?? '')}
                className="flex-1 px-4 py-2.5 bg-ynab-navy text-white text-sm font-medium rounded-xl hover:bg-ynab-blue"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
