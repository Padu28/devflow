import { Component, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Lock, Moon, RefreshCw, Sun, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/features/auth/store';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-md', className)} aria-hidden="true" />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]',
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  extra,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text)]">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{subtitle}</p>}
      </div>
      {(extra || action) && (
        <div className="flex flex-wrap items-center gap-2">
          {extra}
          {action}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--muted-bg)] text-[var(--text-muted)]">
          {icon}
        </div>
      )}
      <h3 className="font-display text-base font-semibold text-[var(--text)]">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message = 'Something went wrong while loading this view.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-6 py-10 text-center"
    >
      <AlertTriangle className="mb-2 h-8 w-8 text-[var(--danger)]" />
      <p className="text-sm font-medium text-[var(--text)]">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}

export function PermissionDenied({
  message = "You don't have permission to view or perform this action.",
}: {
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
      <Lock className="mb-3 h-8 w-8 text-[var(--text-muted)]" />
      <h3 className="font-display text-base font-semibold text-[var(--text)]">Access restricted</h3>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">{message}</p>
    </div>
  );
}

export function ThemeToggle() {
  const theme = useAuthStore((s) => s.theme);
  const toggleTheme = useAuthStore((s) => s.toggleTheme);
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function OfflineBanner() {
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-[var(--warning)] px-4 py-1.5 text-xs font-medium text-[#0A0A0B]"
    >
      <WifiOff className="h-3.5 w-3.5" />
      You are offline. Changes will not be saved until your connection returns.
    </div>
  );
}

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
          <div className="max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-[var(--danger)]" />
            <h1 className="font-display text-lg font-semibold">Unexpected error</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{this.state.message}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Reload DevFlow
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

