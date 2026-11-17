import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { cn, formatActivitySentence, formatRelativeTime } from '@/lib/utils';
import type { Notification, NotificationListResponse } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Overlays';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';

export default function NotificationsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const query = useInfiniteQuery({
    queryKey: ['notifications', 'page', filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<NotificationListResponse>(
        `/api/v1/notifications?unread_only=${filter === 'unread'}&limit=20${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''
        }`,
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post<Notification>(`/api/v1/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.unreadCount });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/api/v1/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.unreadCount });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Mentions, assignments, comments, and status updates across your workspaces."
        extra={
          <SegmentedControl
            layoutId="notif-filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread' },
            ]}
          />
        }
        action={
          <Button variant="secondary" size="sm" onClick={() => markAll.mutate()}>
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </Button>
        }
      />

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-5 w-5" />}
          title="No notifications"
          description={
            filter === 'unread'
              ? 'You have read every notification.'
              : 'When teammates assign tasks or comment, updates appear here.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                if (!n.read_at) markRead.mutate(n.id);
                const ev = n.event;
                const taskId =
                  ev.entity_type === 'task'
                    ? ev.entity_id
                    : typeof ev.metadata.task_id === 'string'
                      ? ev.metadata.task_id
                      : null;
                if (ev.project_id && taskId && orgSlug) {
                  navigate(`/w/${orgSlug}/projects/${ev.project_id}?task=${taskId}`);
                }
              }}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--muted-bg)]',
                !n.read_at && 'bg-[var(--accent)]/5',
              )}
            >
              <Avatar user={n.event.actor} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--text)]">{formatActivitySentence(n.event)}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {formatRelativeTime(n.created_at)}
                </p>
              </div>
              {!n.read_at && <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />}
            </button>
          ))}
        </div>
      )}

      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

