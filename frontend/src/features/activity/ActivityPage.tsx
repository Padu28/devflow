import { useInfiniteQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { formatActivitySentence, formatRelativeTime } from '@/lib/utils';
import type { ActivityEvent, CursorResponse } from '@/lib/types';
import { useCurrentOrg } from '@/features/organizations/useCurrentOrg';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';

export default function ActivityPage() {
  const { org } = useCurrentOrg();

  const query = useInfiniteQuery({
    queryKey: ['org', org?.id, 'activity', 'feed'],
    enabled: Boolean(org?.id),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<CursorResponse<ActivityEvent>>(
        `/api/v1/organizations/${org!.id}/activity?limit=25${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''
        }`,
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const grouped = items.reduce<Record<string, ActivityEvent[]>>((acc, ev) => {
    const day = format(parseISO(ev.created_at), 'EEEE, MMM d');
    (acc[day] ??= []).push(ev);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Activity Feed"
        subtitle="Immutable audit log of project, task, and membership changes."
      />

      {query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-5 w-5" />}
          title="No activity yet"
          description="Actions taken in projects and tasks will appear here chronologically."
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([day, events]) => (
            <section key={day}>
              <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {day}
              </h2>
              <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar user={ev.actor} size="sm" />
                    <p className="min-w-0 flex-1 text-sm text-[var(--text)]">
                      {formatActivitySentence(ev)}
                    </p>
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">
                      {formatRelativeTime(ev.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {query.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                loading={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                Load older events
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

