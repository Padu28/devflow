import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, CheckCircle2, Clock, FolderKanban, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { formatActivitySentence, formatRelativeTime } from '@/lib/utils';
import type {
  ActivityEvent,
  AnalyticsOverview,
  CursorResponse,
  PageResponse,
  ProjectSummary,
} from '@/lib/types';
import { useAuthStore } from '@/features/auth/store';
import { useCurrentOrg } from '@/features/organizations/useCurrentOrg';
import { Avatar, AvatarStack } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/States';
import { CreateProjectDialog } from './CreateProjectDialog';

function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame = 0;
    const steps = 16;
    const id = setInterval(() => {
      frame += 1;
      setDisplay(Math.round((value * frame) / steps));
      if (frame >= steps) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [value]);
  return <span>{display}</span>;
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { org } = useCurrentOrg();
  const [createOpen, setCreateOpen] = useState(false);

  const analyticsQuery = useQuery({
    queryKey: org ? queryKeys.analytics(org.id, undefined, 30) : ['no-org'],
    enabled: Boolean(org?.id),
    queryFn: () =>
      api.get<AnalyticsOverview>(`/api/v1/organizations/${org!.id}/analytics/overview?days=30`),
  });

  const projectsQuery = useQuery({
    queryKey: org ? queryKeys.projects(org.id, { page: 1, page_size: 6 }) : ['no-proj'],
    enabled: Boolean(org?.id),
    queryFn: () =>
      api.get<PageResponse<ProjectSummary>>(
        `/api/v1/organizations/${org!.id}/projects?page=1&page_size=6`,
      ),
  });

  const activityQuery = useQuery({
    queryKey: org ? queryKeys.orgActivity(org.id) : ['no-act'],
    enabled: Boolean(org?.id),
    queryFn: () =>
      api.get<CursorResponse<ActivityEvent>>(`/api/v1/organizations/${org!.id}/activity?limit=8`),
  });

  if (!org) return null;
  const canCreate = org.role !== 'viewer';
  const totals = analyticsQuery.data?.totals;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${user?.display_name.split(' ')[0] ?? 'there'}`}
        subtitle={`${org.name} · ${org.member_count} members · ${org.project_count} active projects`}
        action={
          canCreate ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          ) : undefined
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {analyticsQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : (
          [
            {
              label: 'Open tasks',
              value: totals?.open ?? 0,
              icon: FolderKanban,
              color: 'text-[var(--info)]',
            },
            {
              label: 'Completed',
              value: totals?.completed ?? 0,
              icon: CheckCircle2,
              color: 'text-[var(--success)]',
            },
            {
              label: 'Due this week',
              value: totals?.due_this_week ?? 0,
              icon: Clock,
              color: 'text-[var(--warning)]',
            },
            {
              label: 'Overdue',
              value: totals?.overdue ?? 0,
              icon: AlertCircle,
              color: 'text-[var(--danger)]',
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card"
            >
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>{kpi.label}</span>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
              <p className="mt-2 font-display text-3xl font-bold tracking-tight">
                <CountUp value={kpi.value} />
              </p>
            </div>
          ))
        )}
      </div>

      {/* Projects + Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Active projects</h2>
            <Link
              to={`/w/${org.slug}/projects`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-text)] hover:underline"
            >
              All projects <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {projectsQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : (projectsQuery.data?.items ?? []).length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-5 w-5" />}
              title="No projects yet"
              description="Create your first project to start organizing tasks on a Kanban board."
              action={
                canCreate ? (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" /> Create project
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {projectsQuery.data!.items.map((p) => {
                const pct =
                  p.task_count > 0 ? Math.round((p.done_count / p.task_count) * 100) : 0;
                return (
                  <Link
                    key={p.id}
                    to={`/w/${org.slug}/projects/${p.id}`}
                    className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--border-strong)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-3 w-3 rounded-sm"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="font-display text-sm font-semibold group-hover:text-[var(--accent-text)]">
                          {p.name}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        {p.key}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs text-[var(--text-muted)]">
                      {p.description || 'No description'}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <AvatarStack users={p.members_preview} max={4} size="xs" />
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        {p.done_count}/{p.task_count} done ({pct}%)
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Recent activity</h2>
            <Link
              to={`/w/${org.slug}/activity`}
              className="text-xs font-medium text-[var(--accent-text)] hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {activityQuery.isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (activityQuery.data?.items ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
                No recent activity yet.
              </p>
            ) : (
              activityQuery.data!.items.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                  <Avatar user={ev.actor} size="xs" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug text-[var(--text)]">
                      {formatActivitySentence(ev)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {formatRelativeTime(ev.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={org.id}
        orgSlug={org.slug}
      />
    </div>
  );
}

