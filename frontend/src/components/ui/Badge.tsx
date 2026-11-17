import type { ReactNode } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Flame, Minus } from 'lucide-react';
import { cn, PRIORITY_META } from '@/lib/utils';
import type { Priority } from '@/lib/types';

export function Badge({
  children,
  className,
  color,
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text)]',
        className,
      )}
      style={
        color
          ? {
              borderColor: `${color}44`,
              backgroundColor: `${color}1A`,
              color,
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--muted-bg)] px-1.5 font-mono text-[10px] font-medium text-[var(--text-muted)]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function PriorityBadge({
  priority,
  showLabel = true,
}: {
  priority: Priority;
  showLabel?: boolean;
}) {
  const meta = PRIORITY_META[priority];
  const Icon =
    priority === 'urgent'
      ? Flame
      : priority === 'high'
        ? ArrowUp
        : priority === 'medium'
          ? AlertCircle
          : priority === 'low'
            ? ArrowDown
            : Minus;

  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: meta.color, backgroundColor: meta.bg }}
      aria-label={`Priority: ${meta.label}`}
      title={`Priority: ${meta.label}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}

