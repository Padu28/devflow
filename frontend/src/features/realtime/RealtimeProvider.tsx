import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { API_BASE } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { formatActivitySentence } from '@/lib/utils';
import type { Notification, PresenceUser, RealtimeEnvelope } from '@/lib/types';
import { useAuthStore } from '@/features/auth/store';
import { RealtimeClient, type ConnectionStatus } from './client';

interface RealtimeContextValue {
  status: ConnectionStatus;
  presence: PresenceUser[];
  flashedTaskIds: Set<string>;
  setActiveProject: (projectId: string | null) => void;
  markOptimisticStart: () => void;
  markOptimisticEnd: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'disconnected',
  presence: [],
  flashedTaskIds: new Set(),
  setActiveProject: () => {},
  markOptimisticStart: () => {},
  markOptimisticEnd: () => {},
});

export function useRealtime() {
  return useContext(RealtimeContext);
}

export function RealtimeProvider({
  orgId,
  children,
}: {
  orgId: string | null;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [flashedTaskIds, setFlashedTaskIds] = useState<Set<string>>(new Set());
  const activeProjectRef = useRef<string | null>(null);
  const clientRef = useRef<RealtimeClient | null>(null);

  const flashTask = (taskId: string) => {
    setFlashedTaskIds((prev) => new Set(prev).add(taskId));
    setTimeout(() => {
      setFlashedTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }, 1200);
  };

  useEffect(() => {
    if (!orgId || !token) {
      setStatus('disconnected');
      setPresence([]);
      return;
    }

    const buildUrl = () => {
      const latestToken = useAuthStore.getState().accessToken;
      if (!latestToken) return null;
      const base = API_BASE
        ? API_BASE.replace(/^http/, 'ws')
        : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
      return `${base}/api/v1/ws/organizations/${orgId}?token=${encodeURIComponent(latestToken)}`;
    };

    const client = new RealtimeClient({
      buildUrl,
      currentUserId: () => useAuthStore.getState().user?.id ?? null,
      onStatusChange: setStatus,
      onReconnect: () => {
        qc.invalidateQueries({ queryKey: ['project'] });
        qc.invalidateQueries({ queryKey: queryKeys.unreadCount });
      },
      onPollFallback: () => {
        if (activeProjectRef.current) {
          qc.invalidateQueries({ queryKey: ['project', activeProjectRef.current, 'board'] });
        }
        qc.invalidateQueries({ queryKey: queryKeys.unreadCount });
      },
      onEvent: (env: RealtimeEnvelope) => {
        const me = useAuthStore.getState().user?.id;
        switch (env.type) {
          case 'hello': {
            if (activeProjectRef.current) {
              client.sendPresenceView(activeProjectRef.current);
            }
            break;
          }
          case 'presence.state': {
            const users = (env.payload.users as PresenceUser[] | undefined) ?? [];
            setPresence(users);
            break;
          }
          case 'task.created':
          case 'task.updated':
          case 'task.moved':
          case 'task.deleted': {
            if (env.project_id) {
              qc.invalidateQueries({ queryKey: ['project', env.project_id, 'board'] });
              qc.invalidateQueries({ queryKey: ['project', env.project_id, 'tasks'] });
            }
            if (env.type !== 'task.deleted' && env.entity_id) {
              qc.invalidateQueries({
                queryKey: queryKeys.task(env.project_id ?? '', env.entity_id),
              });
              if (env.actor_id !== me) {
                flashTask(env.entity_id);
              }
            }
            break;
          }
          case 'comment.created': {
            if (env.entity_id) {
              qc.invalidateQueries({ queryKey: queryKeys.comments(env.entity_id) });
            }
            if (env.project_id) {
              qc.invalidateQueries({ queryKey: ['project', env.project_id, 'board'] });
            }
            break;
          }
          case 'project.updated':
          case 'columns.updated': {
            if (env.project_id) {
              qc.invalidateQueries({ queryKey: ['project', env.project_id] });
            }
            qc.invalidateQueries({ queryKey: ['org', orgId, 'projects'] });
            break;
          }
          case 'notification.created': {
            const notif = env.payload.notification as Notification | undefined;
            qc.invalidateQueries({ queryKey: queryKeys.unreadCount });
            qc.invalidateQueries({ queryKey: ['notifications'] });
            if (notif) {
              toast.info(formatActivitySentence(notif.event));
            }
            break;
          }
        }
      },
    });

    clientRef.current = client;
    client.start();

    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, [orgId, token, userId, qc]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      status,
      presence,
      flashedTaskIds,
      setActiveProject: (projectId) => {
        activeProjectRef.current = projectId;
        clientRef.current?.sendPresenceView(projectId);
      },
      markOptimisticStart: () => clientRef.current?.markOptimisticStart(),
      markOptimisticEnd: () => clientRef.current?.markOptimisticEnd(),
    }),
    [status, presence, flashedTaskIds],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

