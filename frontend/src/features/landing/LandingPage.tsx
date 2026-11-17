import { useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'motion/react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Command,
  Keyboard,
  Layers,
  Lock,
  Radio,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useReducedMotionPref } from '@/lib/hooks';
import type { AuthResponse, OrganizationSummary } from '@/lib/types';
import { useAuthStore } from '@/features/auth/store';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/States';
import { FlowFieldCanvas } from './FlowFieldCanvas';
import { LiveKanbanPreview } from './LiveKanbanPreview';

const STACK_BADGES = [
  'FastAPI',
  'PostgreSQL',
  'React 18',
  'TypeScript',
  'WebSockets',
  'Redis Pub/Sub',
  'SQLAlchemy 2',
  'Alembic',
  'dnd-kit',
  'Motion',
  'Docker Compose',
  'Playwright',
];

const STEPS = [
  {
    step: '01',
    title: 'Create a multi-tenant workspace',
    desc: 'Spin up an isolated organization with role-based boundaries (owner, admin, member, viewer) and invite teammates via secure links.',
  },
  {
    step: '02',
    title: 'Structure projects & Kanban columns',
    desc: 'Every project starts with customizable columns, WIP limits, labels, and atomic issue keys like WEB-12.',
  },
  {
    step: '03',
    title: 'Move work optimistically in real time',
    desc: 'Drag or use keyboard shortcuts. UI updates instantly with automatic rollback on API failure and WebSocket broadcast to teammates.',
  },
  {
    step: '04',
    title: 'Measure velocity with real SQL aggregates',
    desc: 'Track completion trends, overdue tasks, and member workload computed directly from PostgreSQL.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const user = useAuthStore((s) => s.user);
  const reduced = useReducedMotionPref();
  const [demoLoading, setDemoLoading] = useState(false);
  const [spotlight, setSpotlight] = useState({ x: 50, y: 20 });

  const flowRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: flowRef,
    offset: ['start 0.8', 'end 0.5'],
  });
  const lineScaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  const handleHeroMouse = (e: MouseEvent<HTMLElement>) => {
    if (reduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setSpotlight({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      const res = await api.post<AuthResponse>(
        '/api/v1/auth/login',
        { email: 'demo@devflow.dev', password: 'DemoPass123!' },
        { skipAuth: true },
      );
      setSession(res.access_token, res.user);
      const orgs = await api.get<OrganizationSummary[]>('/api/v1/organizations');
      toast.success('Signed in to Acme Labs demo workspace');
      if (orgs.length > 0) {
        navigate(`/w/${orgs[0].slug}`);
      } else {
        navigate('/onboarding');
      }
    } catch {
      toast.error('Demo server unavailable — start the backend and run seed.');
    } finally {
      setDemoLoading(false);
    }
  };

  const words = ['Work', 'that', 'flows.'];

  return (
    <div className="relative min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Sticky top nav */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="DevFlow home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-xs font-medium text-[var(--text-muted)] md:flex">
            <a href="#features" className="hover:text-[var(--text)]">
              Features
            </a>
            <a href="#workflow" className="hover:text-[var(--text)]">
              How it flows
            </a>
            <a href="#engineering" className="hover:text-[var(--text)]">
              Architecture
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Button size="sm" onClick={() => navigate('/onboarding')}>
                Open App <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Sign in
                </Link>
                <Button size="sm" onClick={() => navigate('/register')}>
                  Get started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero section */}
      <section
        onMouseMove={handleHeroMouse}
        className="relative overflow-hidden border-b border-[var(--border)] pb-20 pt-16 sm:pt-24"
      >
        <FlowFieldCanvas />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(650px circle at ${spotlight.x}% ${spotlight.y}%, rgba(198,244,50,0.09), transparent 60%)`,
          }}
        />
        <div className="grain-overlay pointer-events-none absolute inset-0" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-6">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)]/80 px-3 py-1 text-xs text-[var(--text-muted)] backdrop-blur"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent-text)]" />
            <span>Multi-tenant Kanban · WebSockets · PostgreSQL</span>
          </motion.div>

          <h1 className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-4 font-display text-5xl font-bold tracking-tight sm:text-7xl">
            {words.map((word, idx) => (
              <span key={word} className="inline-block overflow-hidden pb-1">
                <motion.span
                  initial={reduced ? false : { y: '100%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    duration: 0.48,
                    delay: idx * 0.07,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={
                    idx === 2
                      ? 'inline-block text-[var(--accent-text)]'
                      : 'inline-block text-[var(--text)]'
                  }
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mx-auto mt-5 max-w-xl text-base text-[var(--text-muted)] sm:text-lg"
          >
            A calm, high-craft team workspace engineered with strict tenant isolation, optimistic
            drag-and-drop, and real-time collaboration.
          </motion.p>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.28 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <Button
              size="lg"
              loading={demoLoading}
              onClick={handleDemoLogin}
              className="group shadow-[0_0_28px_-6px_rgba(198,244,50,0.45)]"
            >
              <Zap className="h-4 w-4 transition-transform group-hover:rotate-12" />
              Try Live Demo
            </Button>
            <Button size="lg" variant="secondary" onClick={() => navigate('/register')}>
              Create Workspace <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>

          <LiveKanbanPreview />
        </div>
      </section>

      {/* Infinite marquee proof strip */}
      <div className="overflow-hidden border-b border-[var(--border)] bg-[var(--surface)] py-4">
        <div className="flex w-max animate-marquee gap-4">
          {[...STACK_BADGES, ...STACK_BADGES].map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--muted-bg)] px-3.5 py-1 font-mono text-xs text-[var(--text-muted)]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Bento features grid */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 max-w-xl">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--accent-text)]">
            Product Craft
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Built for speed, clarity, and real teams.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <div className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-colors hover:border-[var(--border-strong)] md:col-span-3">
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent-text)]">
                <Radio className="h-4 w-4" />
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--success)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                WS + Redis Pub/Sub
              </span>
            </div>
            <h3 className="font-display text-lg font-semibold">Real-time presence & sync</h3>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              Authenticated WebSockets broadcast task moves, comments, and live presence indicators
              to active workspace members with exponential backoff and polling fallback.
            </p>
          </div>

          <div className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-colors hover:border-[var(--border-strong)] md:col-span-3">
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#38BDF8]/15 text-[#38BDF8]">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">RBAC Matrix</span>
            </div>
            <h3 className="font-display text-lg font-semibold">Strict tenant boundaries</h3>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              Every query joins through organization membership. Cross-tenant lookups return 404 to
              prevent ID enumeration, while role guards enforce owner, admin, member, and viewer
              permissions.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:col-span-2">
            <BarChart3 className="mb-4 h-5 w-5 text-[var(--accent-text)]" />
            <h3 className="font-display text-base font-semibold">Real SQL analytics</h3>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              Completion trends, overdue counts, and workload per member computed from database
              aggregates.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:col-span-2">
            <Command className="mb-4 h-5 w-5 text-[#A78BFA]" />
            <h3 className="font-display text-base font-semibold">Command palette (⌘K)</h3>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              Jump across workspaces, search tasks server-side by key or title, and trigger quick
              actions without leaving the keyboard.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:col-span-2">
            <Keyboard className="mb-4 h-5 w-5 text-[#FB923C]" />
            <h3 className="font-display text-base font-semibold">Accessible by design</h3>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              Every drag action has a keyboard menu & Alt+Arrow alternative, focus-trapped drawers,
              aria-live save status, and reduced-motion support.
            </p>
          </div>
        </div>
      </section>

      {/* Scroll-linked How it flows */}
      <section id="workflow" className="border-y border-[var(--border)] bg-[var(--surface)] py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6" ref={flowRef}>
          <div className="mb-12">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--accent-text)]">
              Workflow
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">How it flows</h2>
          </div>

          <div className="relative pl-8">
            <div className="absolute bottom-2 left-2.5 top-2 w-0.5 bg-[var(--border)]">
              <motion.div
                style={reduced ? undefined : { scaleY: lineScaleY, transformOrigin: 'top' }}
                className="h-full w-full bg-[var(--accent)]"
              />
            </div>

            <div className="space-y-10">
              {STEPS.map((item) => (
                <div key={item.step} className="relative">
                  <span className="absolute -left-[30px] top-1 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--bg)] font-mono text-[10px] font-bold text-[var(--accent-text)]">
                    {item.step}
                  </span>
                  <h3 className="font-display text-lg font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Engineering / Architecture section for recruiters */}
      <section id="engineering" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--accent-text)]">
              Engineering Highlights
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">
              Designed to explain in a systems interview.
            </h2>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              DevFlow follows a modular monolith architecture with clear separation between HTTP
              routes, domain services, repositories, and realtime fan-out.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                {
                  icon: Lock,
                  text: 'Rotating httpOnly refresh cookies with SHA-256 storage & token-family reuse revocation.',
                },
                {
                  icon: Layers,
                  text: 'Fractional midpoint task ordering with row locks & automatic column rebalancing.',
                },
                {
                  icon: Activity,
                  text: 'Constant-query board loader (no N+1) verified by automated SQL query-count tests.',
                },
                {
                  icon: CheckCircle2,
                  text: 'Optimistic concurrency control via version column (409 stale_update) & UI rollback.',
                },
              ].map((feat) => (
                <li key={feat.text} className="flex items-start gap-2.5 text-[var(--text)]">
                  <feat.icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-text)]" />
                  <span>{feat.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-6 font-mono text-xs">
            <div className="mb-3 flex items-center justify-between text-[var(--text-muted)]">
              <span>architecture.overview</span>
              <span className="text-[var(--accent-text)]">modular-monolith</span>
            </div>
            <pre className="overflow-x-auto leading-relaxed text-[var(--text)]">
{`Browser (React 18 + Motion + dnd-kit)
   │
   ├─ HTTPS REST ──▶ FastAPI /api/v1
   │                    ├─ Auth & Rate Limiter
   │                    ├─ Centralized Tenancy Boundary
   │                    ├─ Domain Services (Tx + Row Locks)
   │                    └─ SQLAlchemy 2 ──▶ PostgreSQL
   │
   └─ WSS /ws/organizations/{id}
                        └─ ConnectionManager ◀─▶ Redis Pub/Sub`}
            </pre>
          </div>
        </div>
      </section>

      {/* Bottom CTA + Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--surface)] py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
          <div>
            <Logo />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Built as a full-stack portfolio flagship with FastAPI, PostgreSQL, React, and Motion.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => navigate('/login')}>
              Sign in
            </Button>
            <Button size="sm" loading={demoLoading} onClick={handleDemoLogin}>
              Try Live Demo
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

