import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/States';

const HIGHLIGHTS = [
  {
    quote: 'Tenant-isolated workspaces with strict RBAC and zero N+1 board queries.',
    tag: 'PostgreSQL + FastAPI',
  },
  {
    quote: 'Optimistic drag-and-drop with transactional row locks and instant rollback.',
    tag: 'dnd-kit + Motion',
  },
  {
    quote: 'Authenticated WebSockets for live presence, task moves, and notifications.',
    tag: 'Realtime Collaboration',
  },
];

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % HIGHLIGHTS.length), 4500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="grid min-h-screen bg-[var(--bg)] lg:grid-cols-2">
      <div className="flex flex-col justify-between p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <Link to="/">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>

        <div className="mx-auto my-10 w-full max-w-sm">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text)]">
            {title}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        <p className="text-center text-xs text-[var(--text-muted)]">
          DevFlow — Multi-tenant project management workspace
        </p>
      </div>

      {/* Right brand panel */}
      <div className="relative hidden overflow-hidden border-l border-[var(--border)] bg-[var(--surface)] p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[var(--accent)]/10 blur-3xl"
        />
        <div className="grain-overlay pointer-events-none absolute inset-0" aria-hidden="true" />

        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--elevated)] px-3 py-1 font-mono text-xs text-[var(--accent-text)]">
            Volt Workspace Engine
          </span>
        </div>

        <div className="relative max-w-md">
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <p className="font-display text-2xl font-semibold leading-snug text-[var(--text)]">
                “{HIGHLIGHTS[idx].quote}”
              </p>
              <p className="mt-4 font-mono text-xs text-[var(--accent-text)]">
                {HIGHLIGHTS[idx].tag}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex gap-1.5">
            {HIGHLIGHTS.map((h, i) => (
              <span
                key={h.tag}
                className={`h-1 rounded-full transition-all ${
                  i === idx ? 'w-8 bg-[var(--accent)]' : 'w-2 bg-[var(--border-strong)]'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between border-t border-[var(--border)] pt-6 font-mono text-xs text-[var(--text-muted)]">
          <span>demo@devflow.dev</span>
          <span>DemoPass123!</span>
        </div>
      </div>
    </div>
  );
}

