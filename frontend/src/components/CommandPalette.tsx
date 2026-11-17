import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  Activity,
  BarChart3,
  Bell,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Settings,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import type { OrganizationSummary, SearchResponse } from '@/lib/types';
import { useAuthStore } from '@/features/auth/store';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Kbd } from '@/components/ui/Badge';

export function CommandPalette({
  open,
  onOpenChange,
  org,
  orgs,
  onLogout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  org: OrganizationSummary | null;
  orgs: OrganizationSummary[];
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const toggleTheme = useAuthStore((s) => s.toggleTheme);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search.trim(), 220);

  const searchQuery = useQuery({
    queryKey: ['cmdk-search', org?.id, debounced],
    enabled: open && Boolean(org?.id) && debounced.length >= 1,
    queryFn: () =>
      api.get<SearchResponse>(
        `/api/v1/organizations/${org!.id}/search?q=${encodeURIComponent(debounced)}&limit=8`,
      ),
  });

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Command Palette" className="max-w-xl overflow-hidden p-0">
        <Command
          shouldFilter={debounced.length === 0}
          className="flex flex-col bg-[var(--elevated)] text-[var(--text)]"
        >
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3.5 py-2.5">
            <Search className="h-4 w-4 text-[var(--text-muted)]" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search tasks, projects, or jump to a page…"
              className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            <Kbd>Esc</Kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-xs text-[var(--text-muted)]">
              No matching tasks or commands.
            </Command.Empty>

            {debounced.length >= 1 && (searchQuery.data?.tasks ?? []).length > 0 && (
              <Command.Group
                heading="Tasks"
                className="mb-2 text-[11px] font-medium text-[var(--text-muted)]"
              >
                {searchQuery.data!.tasks.map((t) => (
                  <Command.Item
                    key={t.id}
                    value={`${t.key} ${t.title}`}
                    onSelect={() =>
                      go(`/w/${org!.slug}/projects/${t.project_id}?task=${t.id}`)
                    }
                    className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-xs text-[var(--text)] aria-selected:bg-[var(--muted-bg)]"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: t.project_color }}
                      />
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        {t.key}
                      </span>
                      <span className="truncate">{t.title}</span>
                    </span>
                    <span className="ml-2 shrink-0 text-[11px] text-[var(--text-muted)]">
                      {t.project_name}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {debounced.length >= 1 && (searchQuery.data?.projects ?? []).length > 0 && (
              <Command.Group
                heading="Projects"
                className="mb-2 text-[11px] font-medium text-[var(--text-muted)]"
              >
                {searchQuery.data!.projects.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={p.name}
                    onSelect={() => go(`/w/${org!.slug}/projects/${p.id}`)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-xs text-[var(--text)] aria-selected:bg-[var(--muted-bg)]"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: p.color }}
                    />
                    <span>{p.name}</span>
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">{p.key}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {org && (
              <Command.Group
                heading="Navigation"
                className="mb-2 text-[11px] font-medium text-[var(--text-muted)]"
              >
                {[
                  { label: 'Dashboard', icon: LayoutDashboard, path: `/w/${org.slug}` },
                  { label: 'Projects', icon: FolderKanban, path: `/w/${org.slug}/projects` },
                  { label: 'Analytics', icon: BarChart3, path: `/w/${org.slug}/analytics` },
                  { label: 'Activity Feed', icon: Activity, path: `/w/${org.slug}/activity` },
                  { label: 'Notifications', icon: Bell, path: `/w/${org.slug}/notifications` },
                  {
                    label: 'Settings',
                    icon: Settings,
                    path: `/w/${org.slug}/settings/profile`,
                  },
                ].map((item) => (
                  <Command.Item
                    key={item.path}
                    onSelect={() => go(item.path)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-[var(--text)] aria-selected:bg-[var(--muted-bg)]"
                  >
                    <item.icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span>{item.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {orgs.length > 1 && (
              <Command.Group
                heading="Switch Workspace"
                className="mb-2 text-[11px] font-medium text-[var(--text-muted)]"
              >
                {orgs.map((o) => (
                  <Command.Item
                    key={o.id}
                    onSelect={() => go(`/w/${o.slug}`)}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-xs text-[var(--text)] aria-selected:bg-[var(--muted-bg)]"
                  >
                    <span>{o.name}</span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">
                      {o.role}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group
              heading="Actions"
              className="text-[11px] font-medium text-[var(--text-muted)]"
            >
              <Command.Item
                onSelect={() => {
                  toggleTheme();
                  onOpenChange(false);
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-[var(--text)] aria-selected:bg-[var(--muted-bg)]"
              >
                <Moon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span>Toggle light / dark theme</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                  onLogout();
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-[var(--danger)] aria-selected:bg-[var(--muted-bg)]"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign out</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function ShortcutsHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shortcuts = [
    { keys: '⌘K / Ctrl+K', desc: 'Open command palette' },
    { keys: '/', desc: 'Quick search workspace' },
    { keys: '?', desc: 'Show keyboard shortcuts' },
    { keys: 'Alt + ← / →', desc: 'Move focused task card across columns' },
    { keys: 'Alt + ↑ / ↓', desc: 'Reorder focused task card within column' },
    { keys: 'Esc', desc: 'Close drawer or modal' },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Keyboard shortcuts" className="max-w-md">
        <div className="divide-y divide-[var(--border)]">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-2.5 text-xs">
              <span className="text-[var(--text-muted)]">{s.desc}</span>
              <Kbd>{s.keys}</Kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

