import { clsx, type ClassValue } from 'clsx';
import { format, formatDistanceToNowStrict, isPast, parseISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import type { ActivityEvent, Priority } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatRelativeTime(iso: string): string {
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'MMM d');
  } catch {
    return '';
  }
}

export function isOverdue(dueAt: string | null, completedAt: string | null): boolean {
  if (!dueAt || completedAt) return false;
  try {
    return isPast(parseISO(dueAt));
  } catch {
    return false;
  }
}

export const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; bg: string }
> = {
  urgent: { label: 'Urgent', color: '#F43F5E', bg: 'rgba(244,63,94,0.14)' },
  high: { label: 'High', color: '#FB923C', bg: 'rgba(251,146,60,0.14)' },
  medium: { label: 'Medium', color: '#FACC15', bg: 'rgba(250,204,21,0.14)' },
  low: { label: 'Low', color: '#38BDF8', bg: 'rgba(56,189,248,0.14)' },
  none: { label: 'None', color: '#71717A', bg: 'rgba(113,113,122,0.14)' },
};

export function formatActivitySentence(event: ActivityEvent): string {
  const actor = event.actor.display_name;
  const meta = event.metadata || {};
  const taskKey = typeof meta.task_key === 'string' ? meta.task_key : '';
  const taskTitle = typeof meta.task_title === 'string' ? meta.task_title : '';
  const taskLabel = taskKey ? `${taskKey}${taskTitle ? ` "${taskTitle}"` : ''}` : 'a task';

  switch (event.action) {
    case 'organization.created':
      return `${actor} created workspace ${String(meta.name || '')}`.trim();
    case 'project.created':
      return `${actor} created project ${String(meta.project_name || '')}`.trim();
    case 'project.updated':
      return `${actor} updated project ${String(meta.project_name || '')}`.trim();
    case 'project.archived':
      return `${actor} archived project ${String(meta.project_name || '')}`.trim();
    case 'project.unarchived':
      return `${actor} restored project ${String(meta.project_name || '')}`.trim();
    case 'task.created':
      return `${actor} created ${taskLabel}`;
    case 'task.moved':
      return `${actor} moved ${taskLabel} from ${String(meta.from_column || '?')} -> ${String(meta.to_column || '?')}`;
    case 'task.assigned':
      return `${actor} assigned ${taskLabel} to ${String(meta.assignee_name || 'someone')}`;
    case 'task.updated': {
      const changes = Array.isArray(meta.changes) ? meta.changes.join(', ') : 'details';
      return `${actor} updated ${changes} on ${taskLabel}`;
    }
    case 'task.deleted':
      return `${actor} deleted ${taskLabel}`;
    case 'comment.created':
      return `${actor} commented on ${taskLabel}`;
    case 'member.joined':
      return `${actor} joined the workspace as ${String(meta.role || 'member')}`;
    case 'member.role_changed':
      return `${actor} changed ${String(meta.member_name || 'member')} role to ${String(meta.to_role || '')}`;
    case 'member.removed':
      return `${actor} removed ${String(meta.member_name || 'a member')} from the workspace`;
    case 'invitation.sent':
      return `${actor} invited ${String(meta.email || 'someone')} as ${String(meta.role || 'member')}`;
    default:
      return `${actor} performed ${event.action}`;
  }
}

