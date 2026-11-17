import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { PRIORITY_META } from '@/lib/utils';
import type { AnalyticsOverview, PageResponse, ProjectSummary } from '@/lib/types';
import { useCurrentOrg } from '@/features/organizations/useCurrentOrg';
import { SegmentedControl, SelectField } from '@/components/ui/Overlays';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';

export default function AnalyticsPage() {
  const { org } = useCurrentOrg();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [projectId, setProjectId] = useState<string>('all');

  const projectsQuery = useQuery({
    queryKey: org ? queryKeys.projects(org.id, { page: 1, page_size: 50 }) : ['no-proj'],
    enabled: Boolean(org?.id),
    queryFn: () =>
      api.get<PageResponse<ProjectSummary>>(
        `/api/v1/organizations/${org!.id}/projects?page=1&page_size=50`,
      ),
  });

  const pid = projectId === 'all' ? undefined : projectId;
  const analyticsQuery = useQuery({
    queryKey: org ? queryKeys.analytics(org.id, pid, Number(days)) : ['no-ana'],
    enabled: Boolean(org?.id),
    queryFn: () =>
      api.get<AnalyticsOverview>(
        `/api/v1/organizations/${org!.id}/analytics/overview?days=${days}${
          pid ? `&project_id=${pid}` : ''
        }`,
      ),
  });

  if (!org) return null;

  const data = analyticsQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        subtitle="Real-time aggregates computed directly from PostgreSQL."
        extra={
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-44">
              <SelectField
                aria-label="Filter analytics by project"
                value={projectId}
                onValueChange={setProjectId}
                options={[
                  { value: 'all', label: 'All projects' },
                  ...(projectsQuery.data?.items ?? []).map((p) => ({
                    value: p.id,
                    label: p.name,
                  })),
                ]}
              />
            </div>
            <SegmentedControl
              layoutId="analytics-days"
              value={days}
              onChange={setDays}
              options={[
                { value: '7', label: '7d' },
                { value: '30', label: '30d' },
                { value: '90', label: '90d' },
              ]}
            />
          </div>
        }
      />

      {analyticsQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      ) : analyticsQuery.isError || !data ? (
        <ErrorState onRetry={() => analyticsQuery.refetch()} />
      ) : data.totals.tasks === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="No task data yet"
          description="Create tasks in your projects to unlock completion trends and workload analytics."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              { label: 'Total', value: data.totals.tasks },
              { label: 'Open', value: data.totals.open },
              { label: 'Completed', value: data.totals.completed },
              { label: 'Due this week', value: data.totals.due_this_week },
              { label: 'Overdue', value: data.totals.overdue },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <p className="text-xs text-[var(--text-muted)]">{k.label}</p>
                <p className="mt-1 font-display text-2xl font-bold">{k.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Completion trend */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-4 font-display text-sm font-semibold">
                Completion trend ({days} days)
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.completion_trend}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'var(--elevated)',
                        borderColor: 'var(--border-strong)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="created"
                      name="Created"
                      stroke="#38BDF8"
                      fill="#38BDF8"
                      fillOpacity={0.15}
                    />
                    <Area
                      type="monotone"
                      dataKey="completed"
                      name="Completed"
                      stroke="#C6F432"
                      fill="#C6F432"
                      fillOpacity={0.22}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tasks by status */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-4 font-display text-sm font-semibold">Tasks by status</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.by_status}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'var(--elevated)',
                        borderColor: 'var(--border-strong)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="count" name="Tasks" radius={[6, 6, 0, 0]}>
                      {data.by_status.map((entry, idx) => (
                        <Cell
                          key={entry.name}
                          fill={entry.is_done ? '#10B981' : idx % 2 === 0 ? '#C6F432' : '#38BDF8'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* By priority */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-4 font-display text-sm font-semibold">Tasks by priority</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.by_priority}
                      dataKey="count"
                      nameKey="priority"
                      innerRadius={52}
                      outerRadius={84}
                      paddingAngle={3}
                    >
                      {data.by_priority.map((entry) => (
                        <Cell
                          key={entry.priority}
                          fill={PRIORITY_META[entry.priority]?.color ?? '#71717A'}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'var(--elevated)',
                        borderColor: 'var(--border-strong)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Workload by member */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-4 font-display text-sm font-semibold">Workload by member</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.workload.map((w) => ({
                      name: w.user.display_name.split(' ')[0],
                      open: w.open,
                      overdue: w.overdue,
                      completed: w.completed,
                    }))}
                  >
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'var(--elevated)',
                        borderColor: 'var(--border-strong)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="open" name="Open" stackId="a" fill="#38BDF8" />
                    <Bar dataKey="overdue" name="Overdue" stackId="a" fill="#F43F5E" />
                    <Bar dataKey="completed" name="Completed" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

