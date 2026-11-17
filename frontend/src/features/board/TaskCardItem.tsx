import { type KeyboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowRightLeft, Calendar, CheckSquare, MessageSquare, MoreHorizontal } from 'lucide-react';
import { cn, formatShortDate, isOverdue } from '@/lib/utils';
import type { Column, TaskCard } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, PriorityBadge } from '@/components/ui/Badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/Overlays';

export function TaskCardVisual({
  task,
  flashed,
  isOverlay,
}: {
  task: TaskCard;
  flashed?: boolean;
  isOverlay?: boolean;
}) {
  const overdue = isOverdue(task.due_at, task.completed_at);

  return (
    <div
      className={cn(
        'rounded-xl border bg-[var(--surface)] p-3 text-left transition-shadow',
        isOverlay
          ? 'rotate-2 scale-[1.03] border-[var(--accent)] shadow-popover ring-2 ring-[var(--accent)]/40'
          : 'border-[var(--border)] shadow-card hover:border-[var(--border-strong)]',
        flashed && 'ring-2 ring-[var(--accent)] transition-all duration-500',
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-medium text-[var(--text-muted)]">
          {task.key}
        </span>
        <PriorityBadge priority={task.priority} showLabel={false} />
      </div>

      <p className="text-sm font-medium leading-snug text-[var(--text)]">{task.title}</p>

      {task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.map((lb) => (
            <Badge key={lb.id} color={lb.color} className="px-1.5 py-0 text-[10px]">
              {lb.name}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
        <div className="flex items-center gap-2.5">
          {task.due_at && (
            <span
              className={cn(
                'inline-flex items-center gap-1',
                overdue && 'font-medium text-[var(--danger)]',
              )}
            >
              <Calendar className="h-3 w-3" />
              {formatShortDate(task.due_at)}
            </span>
          )}
          {task.subtask_count > 0 && (
            <span className="inline-flex items-center gap-1 font-mono">
              <CheckSquare className="h-3 w-3" />
              {task.subtask_done_count}/{task.subtask_count}
            </span>
          )}
          {task.comment_count > 0 && (
            <span className="inline-flex items-center gap-1 font-mono">
              <MessageSquare className="h-3 w-3" />
              {task.comment_count}
            </span>
          )}
        </div>
        {task.assignee && <Avatar user={task.assignee} size="xs" />}
      </div>
    </div>
  );
}

export function TaskCardItem({
  task,
  columns,
  canEdit,
  flashed,
  onOpen,
  onMoveTo,
  onKeyboardStep,
}: {
  task: TaskCard;
  columns: Column[];
  canEdit: boolean;
  flashed?: boolean;
  onOpen: (taskId: string) => void;
  onMoveTo: (taskId: string, columnId: string, index: number) => void;
  onKeyboardStep: (task: TaskCard, direction: 'left' | 'right' | 'up' | 'down') => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canEdit,
    data: { type: 'task', task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canEdit || !e.altKey) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onKeyboardStep(task, 'left');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onKeyboardStep(task, 'right');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onKeyboardStep(task, 'up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onKeyboardStep(task, 'down');
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group relative', isDragging && 'opacity-35')}
      onKeyDown={handleKeyDown}
    >
      <div
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={0}
        aria-label={`Task ${task.key}: ${task.title}`}
        onClick={() => onOpen(task.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.altKey) {
            e.preventDefault();
            onOpen(task.id);
          }
        }}
        className="cursor-pointer rounded-xl focus:outline-none"
      >
        <TaskCardVisual task={task} flashed={flashed} />
      </div>

      {canEdit && (
        <div
          className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${task.key}`}
                className="rounded-md bg-[var(--elevated)] p-1 text-[var(--text-muted)] shadow-sm ring-1 ring-[var(--border)] hover:text-[var(--text)]"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Move to column
              </div>
              {columns.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  disabled={c.id === task.column_id}
                  onSelect={() => onMoveTo(task.id, c.id, 0)}
                >
                  <ArrowRightLeft className="h-3 w-3" />
                  <span>{c.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onMoveTo(task.id, task.column_id, 0)}>
                Move to top
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMoveTo(task.id, task.column_id, 9999)}>
                Move to bottom
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
