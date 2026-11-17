import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { cn, formatActivitySentence, formatRelativeTime } from '@/lib/utils';
import type { Notification, NotificationListResponse } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Overlays';
import { Skeleton } from '@/components/ui/States';

export function NotificationsPopover({ orgSlug }: { orgSlug: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  const unreadQuery = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => api.get<{ unread_count: number }>('/api/v1/notifications/unread-count'),
  });

  const listQuery = useQuery({
    queryKey: queryKeys.notifications(tab === 'unread'),
    queryFn: () =>
      api.get<NotificationListResponse>(
        `/api/v1/notifications?unread_only=${tab === 'unread'}&limit=10`,
      ),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post<Notification>(`/api/v1/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.unreadCount });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/api/v1/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.unreadCount });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = unreadQuery.data?.unread_count ?? 0;

  const handleOpenNotif = (n: Notification) => {
    if (!n.read_at) markRead.mutate(n.id);
    setOpen(false);
    const ev = n.event;
    const taskId =
      ev.entity_type === 'task'
        ? ev.entity_id
        : typeof ev.metadata.task_id === 'string'
          ? ev.metadata.task_id
          : null;
    if (ev.project_id && taskId) {
      navigate(`/w/${orgSlug}/projects/${ev.project_id}?task=${taskId}`);
    } else {
      navigate(`/w/${orgSlug}/notifications`);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          className="relative"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <motion.span
              key={unreadCount}
              initial={{ scale: 0.7 }}
              animate={{ scale: 1 }}
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 font-mono text-[10px] font-bold text-[var(--accent-fg)]"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">Notifications</span>
            <div className="flex rounded-md bg-[var(--muted-bg)] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setTab('all')}
                className={cn(
                  'rounded px-2 py-0.5',
                  tab === 'all' ? 'bg-[var(--elevated)] text-[var(--text)]' : 'text-[var(--text-muted)]',
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTab('unread')}
                className={cn(
                  'rounded px-2 py-0.5',
                  tab === 'unread' ? 'bg-[var(--elevated)] text-[var(--text)]' : 'text-[var(--text-muted)]',
                )}
              >
                Unread
              </button>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-text)] hover:underline"
            >
              <CheckCheck className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>

        <div className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto">
          {listQuery.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (listQuery.data?.items ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
              {tab === 'unread' ? 'You are all caught up.' : 'No notifications yet.'}
            </p>
          ) : (
            (listQuery.data?.items ?? []).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleOpenNotif(n)}
                className={cn(
                  'flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--muted-bg)]',
                  !n.read_at && 'bg-[var(--accent)]/5',
                )}
              >
                <Avatar user={n.event.actor} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-snug text-[var(--text)]">
                    {formatActivitySentence(n.event)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    {formatRelativeTime(n.created_at)}
                  </p>
                </div>
                {!n.read_at && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
                )}
              </button>
            ))
          )}
        </div>

        <div className="border-t border-[var(--border)] p-2 text-center">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate(`/w/${orgSlug}/notifications`);
            }}
            className="text-xs font-medium text-[var(--accent-text)] hover:underline"
          >
            View all notifications
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

