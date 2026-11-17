import { cn } from '@/lib/utils';

export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm">
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
          <path d="M5 17L12.5 4h5l-4.5 7.5H20L9.5 21l2.5-5.5H5z" />
        </svg>
      </span>
      {showWordmark && (
        <span className="font-display text-base font-bold tracking-tight text-[var(--text)]">
          DevFlow
        </span>
      )}
    </span>
  );
}

