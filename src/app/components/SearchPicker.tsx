'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

export const pickerInputClass =
  'w-full min-h-[40px] px-3 py-2 border border-gray-200 rounded-xl text-base text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-ynab-green';

export default function SearchPicker({
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
  allowEmpty = false,
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
  allowEmpty?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickingRef = useRef(false);

  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter(o => o.toLowerCase().includes(q)) : [...options];
    if (value && list.includes(value)) {
      return [value, ...list.filter(o => o !== value)].slice(0, 40);
    }
    return list.slice(0, 40);
  }, [options, query, value]);

  const trimmed = query.trim();
  const exactMatch = options.some(o => o.toLowerCase() === trimmed.toLowerCase());
  const showCustom = allowCustom && trimmed.length > 0 && !exactMatch;

  const pick = (name: string) => {
    pickingRef.current = true;
    onSelect(name);
    setQuery(name);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {hint && <span className="text-[11px] text-ynab-muted truncate">{hint}</span>}
      </div>
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={query}
        placeholder={placeholder}
        className={pickerInputClass}
        onFocus={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.select());
        }}
        onChange={e => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          if (allowCustom) onSelect(next);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
            if (pickingRef.current) {
              pickingRef.current = false;
              return;
            }
            if (allowCustom) {
              onSelect(query.trim());
            } else {
              setQuery(value);
            }
          }, 120);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered.length === 1) pick(filtered[0]);
            else if (showCustom) pick(trimmed);
            else if (allowEmpty && !trimmed) pick('');
          }
          if (e.key === 'Escape') {
            setOpen(false);
            setQuery(value);
            inputRef.current?.blur();
          }
        }}
      />
      {open && (
        <div className="rounded-xl border border-ynab-border overflow-hidden">
          <div className="max-h-52 overflow-y-auto payee-scroll">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
                Loading…
              </div>
            ) : (
              <>
                {allowEmpty && (
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => pick('')}
                    className={`w-full min-h-[36px] text-left px-3 py-1.5 text-sm ${
                      !value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 active:bg-gray-50'
                    }`}
                  >
                    Uncategorized
                  </button>
                )}
                {showCustom && (
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => pick(trimmed)}
                    className="w-full min-h-[36px] text-left px-3 py-1.5 text-sm text-ynab-navy active:bg-gray-50"
                  >
                    Use “{trimmed}”
                  </button>
                )}
                {filtered.length > 0 ? (
                  filtered.map(option => {
                    const selected = option === value;
                    return (
                      <button
                        key={option}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onPointerDown={e => e.preventDefault()}
                        onClick={() => pick(option)}
                        className={`w-full min-h-[36px] text-left px-3 py-1.5 text-sm transition-colors flex items-center justify-between gap-2 ${
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
                ) : !showCustom && !loading ? (
                  <p className="px-3 py-2.5 text-sm text-gray-400">{emptyLabel}</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PickerSheet({
  title,
  query,
  onQuery,
  options,
  optionMeta,
  current,
  onSelect,
  onClose,
  inputRef,
  allowCustom = false,
  emptyLabel = 'No matches',
  allowEmpty = false,
  emptyOptionLabel = 'Uncategorized',
}: {
  title: string;
  query: string;
  onQuery: (q: string) => void;
  options: string[];
  optionMeta?: Record<string, string>;
  current?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  allowCustom?: boolean;
  emptyLabel?: string;
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
}) {
  const trimmed = query.trim();
  const exactMatch = options.some(o => o.toLowerCase() === trimmed.toLowerCase());
  const showCustom = allowCustom && trimmed.length > 0 && !exactMatch;

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-end" onClick={onClose}>
      <div
        data-payee-dropdown
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-t-2xl shadow-2xl w-full max-h-[80vh] flex flex-col"
      >
        <div className="px-4 pt-3 pb-2 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <div className="relative mt-2">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={e => onQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') onClose();
                if (e.key === 'Enter' && options.length === 1) {
                  onSelect(options[0]);
                  onClose();
                } else if (e.key === 'Enter' && showCustom) {
                  onSelect(trimmed);
                  onClose();
                }
              }}
              placeholder={`Search ${title.toLowerCase()}…`}
              className="w-full min-h-[40px] pl-9 pr-3 py-2 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-ynab-green"
            />
          </div>
        </div>
        <div className="overflow-y-auto py-0.5 payee-scroll">
          {allowEmpty && (
            <button
              type="button"
              onClick={() => {
                onSelect('');
                onClose();
              }}
              className={`w-full min-h-[36px] text-left px-4 py-1.5 text-sm ${
                !current ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 active:bg-gray-50'
              }`}
            >
              {emptyOptionLabel}
            </button>
          )}
          {showCustom && (
            <button
              type="button"
              onClick={() => {
                onSelect(trimmed);
                onClose();
              }}
              className="w-full min-h-[36px] text-left px-4 py-1.5 text-sm text-ynab-navy active:bg-gray-50"
            >
              Use “{trimmed}”
            </button>
          )}
          {options.length > 0 ? (
            options.map(option => {
              const selected = option === current;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onSelect(option);
                    onClose();
                  }}
                  className={`w-full min-h-[36px] text-left px-4 py-1.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                    selected ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-800 active:bg-gray-50'
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
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
            })
          ) : !showCustom ? (
            <p className="px-4 py-4 text-sm text-gray-400 text-center">{emptyLabel}</p>
          ) : null}
        </div>
        <div className="px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[40px] rounded-xl border border-gray-300 text-sm font-medium text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
