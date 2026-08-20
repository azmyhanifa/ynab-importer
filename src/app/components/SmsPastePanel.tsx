import { useRef } from 'react';

export default function SmsPastePanel({
  value,
  onChange,
  onSubmit,
  compact = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSubmit();
    requestAnimationFrame(() => ref.current?.focus());
  };

  return (
    <div className={compact ? 'flex gap-2 items-end' : 'space-y-3'}>
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={compact ? 'Paste SMS…' : 'Paste a bank SMS — or several, separated by a blank line'}
        rows={compact ? 2 : 4}
        className={`w-full resize-y rounded-lg border border-ynab-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-ynab-muted focus:outline-none focus:ring-2 focus:ring-ynab-green ${
          compact ? 'min-h-[44px]' : 'min-h-[96px]'
        }`}
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        className={`inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-md text-white bg-ynab-navy hover:bg-ynab-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
          compact ? 'h-[44px] flex-shrink-0' : 'w-full sm:w-auto'
        }`}
      >
        Add
      </button>
    </div>
  );
}
