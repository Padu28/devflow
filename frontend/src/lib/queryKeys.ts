import type { TaskFilters } from './types';

export const queryKeys = {
  orgs: ['orgs'] as const,
  org: (orgId: string) => ['org', orgId] as const,
  members: (orgId: string) => ['org', orgId, 'members'] as const,
  invitations: (orgId: string) => ['org', orgId, 'invitations'] as const,
  myInvitations: ['my-invitations'] as const,
  labels: (orgId: string) => ['org', orgId, 'labels'] as const,
  orgActivity: (orgId: string) => ['org', orgId, 'activity'] as const,
  analytics: (orgId: string, projectId?: string, days = 30) =>
    ['org', orgId, 'analytics', { projectId: projectId ?? null, days }] as const,
  projects: (orgId: string, params?: Record<string, unknown>) =>
    ['org', orgId, 'projects', params ?? {}] as const,
  project: (projectId: string) => ['project', projectId] as const,
  board: (projectId: string, filters?: TaskFilters) =>
    ['project', projectId, 'board', filters ?? {}] as const,
  tasks: (projectId: string, params?: Record<string, unknown>) =>
    ['project', projectId, 'tasks', params ?? {}] as const,
  task: (projectId: string, taskId: string) => ['project', projectId, 'task', taskId] as const,
  comments: (taskId: string) => ['task', taskId, 'comments'] as const,
  projectActivity: (projectId: string) => ['project', projectId, 'activity'] as const,
  savedViews: (projectId: string) => ['project', projectId, 'views'] as const,
  notifications: (unreadOnly = false) => ['notifications', { unreadOnly }] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  notificationPrefs: ['notification-prefs'] as const,
};

