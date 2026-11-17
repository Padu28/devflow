import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban, LayoutGrid, List, Plus, Search, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import { queryKeys } from '@/lib/queryKeys';
import { formatRelativeTime } from '@/lib/utils';
import type { PageResponse, ProjectSummary } from '@/lib/types';
import { useCurrentOrg } from '@/features/organizations/useCurrentOrg';
import { AvatarStack } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SegmentedControl, SelectField } from '@/components/ui/Overlays';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { CreateProjectDialog } from './CreateProjectDialog';

export default function ProjectsPage() {
  const { org } = useCurrentOrg();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [archivedTab, setArchivedTab] = useState<'active' | 'archived'>('active');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedQ = useDebounce(search.trim(), 250);

  const query = useQuery({
    queryKey: org
      ? queryKeys.projects(org.id, {
          q: debouncedQ,
          status: statusFilter,
          archived: archivedTab === 'archived',
          page,
        })
      : ['no-projects'],
    enabled: Boolean(org?.id),
    queryFn: () => {
      const sp = new URLSearchParams({
        archived: String(archivedTab === 'archived'),
        page: String(page),
        page_size: '12',
      });
      if (debouncedQ) sp.set('q', debouncedQ);
      if (statusFilter !== 'all') sp.set('status', statusFilter);
      return api.get<PageResponse<ProjectSummary>>(
        `/api/v1/organizations/${org!.id}/projects?${sp.toString()}`,
      );
    },
  });

  if (!org) return null;
  const canCreate = org.role !== 'viewer';
  const items = query.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Manage boards, members, and delivery status across your workspace."
        action={
          canCreate ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-60">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              aria-label="Search projects"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>

          <div className="w-36">
            <SelectField
              aria-label="Filter by status"
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
          </div>

          <SegmentedControl
            layoutId="projects-archived"
            value={archivedTab}
            onChange={(v) => {
              setArchivedTab(v);
              setPage(1);
            }}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted-bg)] p-0.5">
          <button
            type="button"
            aria-label="Grid view"
            onClick={() => setView('grid')}
            className={`rounded-md p-1.5 ${
              view === 'grid' ? 'bg-[var(--elevated)] text-[var(--text)]' : 'text-[var(--text-muted)]'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="List view"
            onClick={() => setView('list')}
            className={`rounded-md p-1.5 ${
              view === 'list' ? 'bg-[var(--elevated)] text-[var(--text)]' : 'text-[var(--text-muted)]'
            }`}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-5 w-5" />}
          title={archivedTab === 'archived' ? 'No archived projects' : 'No projects found'}
          description={
            debouncedQ
              ? 'Try clearing your search or status filter.'
              : 'Create a project to launch your first Kanban board.'
          }
          action={
            canCreate && archivedTab === 'active' ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New project
              </Button>
            ) : undefined
          }
        />
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => {
            const pct = p.task_count > 0 ? Math.round((p.done_count / p.task_count) * 100) : 0;
            return (
              <div
                key={p.id}
                className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card transition-colors hover:border-[var(--border-strong)]"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/w/${org.slug}/projects/${p.id}`}
                      className="flex items-center gap-2.5 font-display text-base font-semibold hover:text-[var(--accent-text)]"
                    >
                      <span
                        className="h-3 w-3 rounded-sm"
                        style={{ backgroundColor: p.color }}
                      />
                      <span>{p.name}</span>
                    </Link>
                    <div className="flex items-center gap-1.5">
                      <Badge className="font-mono">{p.key}</Badge>
                      <Link
                        to={`/w/${org.slug}/projects/${p.id}/settings`}
                        aria-label={`Settings for ${p.name}`}
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--muted-bg)] hover:text-[var(--text)]"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-[var(--text-muted)]">
                    {p.description || 'No description provided.'}
                  </p>
                </div>

                <div className="mt-5 space-y-3">
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-[var(--text-muted)]">
                      <span>Progress</span>
                      <span className="font-mono">
                        {p.done_count}/{p.task_count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted-bg)]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: p.color }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <AvatarStack users={p.members_preview} max={4} size="xs" />
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Updated {formatRelativeTime(p.updated_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--border)] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tasks</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--muted-bg)]/60">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to={`/w/${org.slug}/projects/${p.id}`}
                      className="flex items-center gap-2 hover:text-[var(--accent-text)]"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-[var(--text-muted)]">{p.key}</td>
                  <td className="px-4 py-3 capitalize">{p.status}</td>
                  <td className="px-4 py-3 font-mono">
                    {p.done_count}/{p.task_count}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {formatRelativeTime(p.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {query.data && query.data.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="font-mono text-xs text-[var(--text-muted)]">
            Page {query.data.page} of {query.data.pages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= query.data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={org.id}
        orgSlug={org.slug}
      />
    </div>
  );
}

