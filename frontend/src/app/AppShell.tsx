import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  BarChart3,
  Bell,
  ChevronsUpDown,
  FolderKanban,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import type { PageResponse, ProjectSummary } from '@/lib/types';
import { useAuthStore } from '@/features/auth/store';
import { useCurrentOrg } from '@/features/organizations/useCurrentOrg';
import { RealtimeProvider, useRealtime } from '@/features/realtime/RealtimeProvider';
import { NotificationsPopover } from '@/features/notifications/NotificationsPopover';
import { CommandPalette, ShortcutsHelpDialog } from '@/components/CommandPalette';
import { Avatar, AvatarStack } from '@/components/ui/Avatar';
import { Kbd } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/Overlays';
import { OfflineBanner, Spinner, ThemeToggle } from '@/components/ui/States';

function ShellInner() {
  const { org, orgs, isLoading } = useCurrentOrg();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { status, presence } = useRealtime();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const projectsQuery = useQuery({
    queryKey: org ? queryKeys.projects(org.id, { sidebar: true }) : ['no-sidebar-proj'],
    enabled: Boolean(org?.id),
    queryFn: () =>
      api.get<PageResponse<ProjectSummary>>(
        `/api/v1/organizations/${org!.id}/projects?page=1&page_size=12`,
      ),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      } else if (!editing && e.key === '/') {
        e.preventDefault();
        setCmdOpen(true);
      } else if (!editing && e.key === '?') {
        e.preventDefault();
        setHelpOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // Ignore network errors on logout
    }
    clearSession();
    qc.clear();
    navigate('/login', { replace: true });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <Spinner />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6 text-center">
        <h1 className="font-display text-xl font-bold">Workspace not found</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          You don’t have access to this workspace or it no longer exists.
        </p>
        <Button className="mt-4" onClick={() => navigate('/onboarding')}>
          Choose a workspace
        </Button>
      </div>
    );
  }

  const navItems = [
    { to: `/w/${org.slug}`, label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: `/w/${org.slug}/projects`, label: 'Projects', icon: FolderKanban, end: false },
    { to: `/w/${org.slug}/analytics`, label: 'Analytics', icon: BarChart3, end: false },
    { to: `/w/${org.slug}/activity`, label: 'Activity', icon: Activity, end: false },
    { to: `/w/${org.slug}/notifications`, label: 'Notifications', icon: Bell, end: false },
    { to: `/w/${org.slug}/settings/profile`, label: 'Settings', icon: Settings, end: false },
  ];

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between p-3">
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1.5 pt-1">
          <Link to={`/w/${org.slug}`}>
            <Logo />
          </Link>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="rounded-md p-1 text-[var(--text-muted)] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Workspace switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--muted-bg)] px-2.5 py-2 text-left text-xs transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text)]">{org.name}</p>
                <p className="font-mono text-[10px] capitalize text-[var(--text-muted)]">
                  {org.role}
                </p>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {orgs.map((o) => (
              <DropdownMenuItem key={o.id} onSelect={() => navigate(`/w/${o.slug}`)}>
                <span className="flex-1 truncate">{o.name}</span>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">{o.role}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/onboarding')}>
              <Plus className="h-3.5 w-3.5" /> Create workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Nav */}
        <nav aria-label="Workspace navigation" className="space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
                  isActive
                    ? 'text-[var(--text)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--muted-bg)]/60 hover:text-[var(--text)]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active-pill"
                      transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                      className="absolute inset-0 rounded-lg bg-[var(--muted-bg)]"
                    />
                  )}
                  <item.icon className="relative z-10 h-4 w-4 shrink-0" />
                  <span className="relative z-10">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Projects quick list */}
        <div className="space-y-1 pt-2">
          <p className="px-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Projects
          </p>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {(projectsQuery.data?.items ?? []).map((p) => (
              <NavLink
                key={p.id}
                to={`/w/${org.slug}/projects/${p.id}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                    isActive
                      ? 'bg-[var(--muted-bg)] font-medium text-[var(--text)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--muted-bg)]/50 hover:text-[var(--text)]',
                  )
                }
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: p.color }}
                />
                <span className="truncate">{p.name}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      {/* User footer */}
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg border border-transparent p-2 text-left text-xs hover:border-[var(--border)] hover:bg-[var(--muted-bg)]"
            >
              <Avatar user={user} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[var(--text)]">{user.display_name}</p>
                <p className="truncate text-[11px] text-[var(--text-muted)]">{user.email}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onSelect={() => navigate(`/w/${org.slug}/settings/profile`)}>
              <Settings className="h-3.5 w-3.5" /> Profile & Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setHelpOpen(true)}>
              <HelpCircle className="h-3.5 w-3.5" /> Keyboard shortcuts
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={handleLogout}>
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile drawer sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 h-full w-64 border-r border-[var(--border)] bg-[var(--surface)]">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <header className="sticky top-0 z-30 flex h-13 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg)]/85 px-4 py-2 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>

            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search workspace…</span>
              <Kbd>⌘K</Kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {presence.length > 0 && (
              <div className="hidden sm:block">
                <AvatarStack users={presence.map((p) => p.user)} max={4} size="xs" />
              </div>
            )}

            <Tooltip
              content={`Realtime: ${
                status === 'connected'
                  ? 'Connected'
                  : status === 'connecting'
                    ? 'Connecting…'
                    : 'Disconnected (polling fallback)'
              }`}
            >
              <span
                aria-label={`Realtime status: ${status}`}
                className={cn(
                  'h-2 w-2 rounded-full',
                  status === 'connected'
                    ? 'bg-[var(--success)]'
                    : status === 'connecting'
                      ? 'bg-[var(--warning)]'
                      : 'bg-[var(--text-muted)]',
                )}
              />
            </Tooltip>

            <NotificationsPopover orgSlug={org.slug} />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        org={org}
        orgs={orgs}
        onLogout={handleLogout}
      />
      <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

export function AppShell() {
  const { org } = useCurrentOrg();
  return (
    <RealtimeProvider orgId={org?.id ?? null}>
      <ShellInner />
    </RealtimeProvider>
  );
}

