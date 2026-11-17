import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Plus, Search, Settings, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { applyOptimisticBoardMove } from '@/lib/boardMove';
import { useDebounce } from '@/lib/hooks';
import { queryKeys } from '@/lib/queryKeys';
import { cn, formatShortDate, isOverdue } from '@/lib/utils';
import type {
  BoardColumnWithTasks,
  BoardData,
  Label,
  Member,
  PageResponse,
  Priority,
  SavedView,
  TaskCard,
  TaskFilters,
} from '@/lib/types';
import { useCurrentOrg } from '@/features/organizations/useCurrentOrg';
import { useRealtime } from '@/features/realtime/RealtimeProvider';
import { Avatar, AvatarStack } from '@/components/ui/Avatar';
import { PriorityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  SelectField,
} from '@/components/ui/Overlays';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { TaskDrawer } from '@/features/tasks/TaskDrawer';
import { TaskCardItem, TaskCardVisual } from './TaskCardItem';

function BoardColumn({
  column,
  allColumns,
  canEdit,
  flashedTaskIds,
  onOpenTask,
  onMoveTo,
  onKeyboardStep,
  onQuickAdd,
}: {
  column: BoardColumnWithTasks;
  allColumns: BoardColumnWithTasks[];
  canEdit: boolean;
  flashedTaskIds: Set<string>;
  onOpenTask: (id: string) => void;
  onMoveTo: (taskId: string, columnId: string, index: number) => void;
  onKeyboardStep: (task: TaskCard, dir: 'left' | 'right' | 'up' | 'down') => void;
  onQuickAdd: (columnId: string, title: string) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column', column } });
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const overWip = column.wip_limit !== null && column.tasks.length > column.wip_limit;

  const submitAdd = async () => {
    const t = newTitle.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    try {
      await onQuickAdd(column.id, t);
      setNewTitle('');
      setAdding(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-2xl border bg-[var(--surface)]/70 p-2.5 transition-colors sm:w-80',
        isOver ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)]',
      )}
    >
      <div className="mb-2.5 flex items-center justify-between px-1.5 py-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: column.color ?? '#71717A' }}
          />
          <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--text)]">
            {column.name}
          </h2>
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 font-mono text-[10px]',
              overWip
                ? 'bg-[var(--danger)]/15 text-[var(--danger)]'
                : 'bg-[var(--muted-bg)] text-[var(--text-muted)]',
            )}
          >
            {column.tasks.length}
            {column.wip_limit !== null ? `/${column.wip_limit}` : ''}
          </span>
        </div>
        {canEdit && (
          <button
            type="button"
            aria-label={`Add task to ${column.name}`}
            onClick={() => setAdding(true)}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--muted-bg)] hover:text-[var(--text)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
          {column.tasks.map((task) => (
            <TaskCardItem
              key={task.id}
              task={task}
              columns={allColumns}
              canEdit={canEdit}
              flashed={flashedTaskIds.has(task.id)}
              onOpen={onOpenTask}
              onMoveTo={onMoveTo}
              onKeyboardStep={onKeyboardStep}
            />
          ))}
          {column.tasks.length === 0 && !adding && (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-8 text-xs text-[var(--text-muted)]">
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>

      {canEdit && (
        <div className="mt-2 pt-1">
          {adding ? (
            <div className="space-y-2 rounded-xl border border-[var(--border-strong)] bg-[var(--elevated)] p-2">
              <Input
                autoFocus
                aria-label={`New task title for ${column.name}`}
                placeholder="Task title… (Enter to save)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitAdd();
                  } else if (e.key === 'Escape') {
                    setAdding(false);
                    setNewTitle('');
                  }
                }}
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdding(false);
                    setNewTitle('');
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" loading={submitting} onClick={() => void submitAdd()}>
                  Add
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--muted-bg)] hover:text-[var(--text)]"
            >
              <Plus className="h-3.5 w-3.5" /> Add task
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { org } = useCurrentOrg();
  const { presence, flashedTaskIds, setActiveProject, markOptimisticStart, markOptimisticEnd } =
    useRealtime();

  const viewMode = searchParams.get('view') === 'list' ? 'list' : 'board';
  const activeTaskId = searchParams.get('task');

  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const debouncedQ = useDebounce(searchInput.trim(), 250);
  const [listPage, setListPage] = useState(1);
  const [listSort, setListSort] = useState('-updated_at');
  const [activeDragTask, setActiveDragTask] = useState<TaskCard | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [viewName, setViewName] = useState('');

  useEffect(() => {
    if (!projectId) return;
    setActiveProject(projectId);
    return () => setActiveProject(null);
  }, [projectId, setActiveProject]);

  const filters: TaskFilters = useMemo(
    () => ({
      q: debouncedQ || undefined,
      assignee_id: searchParams.get('assignee_id') || undefined,
      priority: (searchParams.get('priority') as Priority) || undefined,
      label_id: searchParams.get('label_id') || undefined,
      due: (searchParams.get('due') as TaskFilters['due']) || undefined,
    }),
    [debouncedQ, searchParams],
  );

  const filterQueryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (filters.q) sp.set('q', filters.q);
    if (filters.assignee_id) sp.set('assignee_id', filters.assignee_id);
    if (filters.priority) sp.set('priority', filters.priority);
    if (filters.label_id) sp.set('label_id', filters.label_id);
    if (filters.due) sp.set('due', filters.due);
    return sp.toString();
  }, [filters]);

  const boardQuery = useQuery({
    queryKey: projectId ? queryKeys.board(projectId, filters) : ['no-board'],
    enabled: Boolean(projectId),
    queryFn: () =>
      api.get<BoardData>(
        `/api/v1/projects/${projectId}/board${filterQueryString ? `?${filterQueryString}` : ''}`,
      ),
  });

  const listQuery = useQuery({
    queryKey: projectId
      ? queryKeys.tasks(projectId, { ...filters, sort: listSort, page: listPage })
      : ['no-tasks'],
    enabled: Boolean(projectId) && viewMode === 'list',
    queryFn: () => {
      const sp = new URLSearchParams(filterQueryString);
      sp.set('sort', listSort);
      sp.set('page', String(listPage));
      sp.set('page_size', '25');
      return api.get<PageResponse<TaskCard>>(
        `/api/v1/projects/${projectId}/tasks?${sp.toString()}`,
      );
    },
  });

  const membersQuery = useQuery({
    queryKey: org ? queryKeys.members(org.id) : ['no-members'],
    enabled: Boolean(org?.id),
    queryFn: () => api.get<Member[]>(`/api/v1/organizations/${org!.id}/members`),
  });

  const labelsQuery = useQuery({
    queryKey: org ? queryKeys.labels(org.id) : ['no-labels'],
    enabled: Boolean(org?.id),
    queryFn: () => api.get<Label[]>(`/api/v1/organizations/${org!.id}/labels`),
  });

  const viewsQuery = useQuery({
    queryKey: projectId ? queryKeys.savedViews(projectId) : ['no-views'],
    enabled: Boolean(projectId),
    queryFn: () => api.get<SavedView[]>(`/api/v1/projects/${projectId}/views`),
  });

  const boardKey = queryKeys.board(projectId ?? '', filters);

  const moveMutation = useMutation({
    mutationFn: ({ taskId, columnId, index }: { taskId: string; columnId: string; index: number }) =>
      api.post<TaskCard>(`/api/v1/projects/${projectId}/tasks/${taskId}/move`, {
        column_id: columnId,
        index,
      }),
    onMutate: async ({ taskId, columnId, index }) => {
      markOptimisticStart();
      await qc.cancelQueries({ queryKey: boardKey });
      const previous = qc.getQueryData<BoardData>(boardKey);
      if (previous) {
        qc.setQueryData<BoardData>(
          boardKey,
          applyOptimisticBoardMove(previous, taskId, columnId, index),
        );
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(boardKey, ctx.previous);
      }
      toast.error(err instanceof ApiError ? err.message : 'Failed to move task — reverted');
    },
    onSettled: () => {
      markOptimisticEnd();
      qc.invalidateQueries({ queryKey: ['project', projectId, 'board'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'tasks'] });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: ({ columnId, title }: { columnId: string; title: string }) =>
      api.post(`/api/v1/projects/${projectId}/tasks`, { column_id: columnId, title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId, 'board'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'tasks'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to create task'),
  });

  const saveViewMutation = useMutation({
    mutationFn: (name: string) =>
      api.post<SavedView>(`/api/v1/projects/${projectId}/views`, { name, filters }),
    onSuccess: () => {
      setViewName('');
      qc.invalidateQueries({ queryKey: queryKeys.savedViews(projectId!) });
      toast.success('View saved');
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: (viewId: string) => api.delete(`/api/v1/projects/${projectId}/views/${viewId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedViews(projectId!) }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const setParam = (key: string, val: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set(key, val);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const handleMoveTo = (taskId: string, columnId: string, index: number) => {
    const colName = boardQuery.data?.columns.find((c) => c.id === columnId)?.name ?? 'column';
    setLiveAnnouncement(`Moved task to ${colName}`);
    moveMutation.mutate({ taskId, columnId, index });
  };

  const handleKeyboardStep = (task: TaskCard, dir: 'left' | 'right' | 'up' | 'down') => {
    const cols = boardQuery.data?.columns ?? [];
    const colIdx = cols.findIndex((c) => c.id === task.column_id);
    if (colIdx === -1) return;
    if (dir === 'left' && colIdx > 0) {
      handleMoveTo(task.id, cols[colIdx - 1].id, 0);
    } else if (dir === 'right' && colIdx < cols.length - 1) {
      handleMoveTo(task.id, cols[colIdx + 1].id, 0);
    } else if (dir === 'up' || dir === 'down') {
      const colTasks = cols[colIdx].tasks;
      const tIdx = colTasks.findIndex((t) => t.id === task.id);
      const nextIdx = dir === 'up' ? Math.max(0, tIdx - 1) : Math.min(colTasks.length - 1, tIdx + 1);
      if (nextIdx !== tIdx) handleMoveTo(task.id, task.column_id, nextIdx);
    }
  };

  const handleDragStart = (ev: DragStartEvent) => {
    const task = ev.active.data.current?.task as TaskCard | undefined;
    if (task) setActiveDragTask(task);
  };

  const handleDragEnd = (ev: DragEndEvent) => {
    setActiveDragTask(null);
    const { active, over } = ev;
    if (!over || !boardQuery.data) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const cols = boardQuery.data.columns;
    const destCol =
      cols.find((c) => c.id === overId) ??
      cols.find((c) => c.tasks.some((t) => t.id === overId));
    if (!destCol) return;

    const siblings = destCol.tasks.filter((t) => t.id !== activeId);
    const overTaskIdx = siblings.findIndex((t) => t.id === overId);
    const targetIdx = overTaskIdx === -1 ? siblings.length : overTaskIdx;

    handleMoveTo(activeId, destCol.id, targetIdx);
  };

  if (boardQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-72" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[460px] w-72 shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (boardQuery.isError || !boardQuery.data || !org || !projectId) {
    return <ErrorState onRetry={() => boardQuery.refetch()} />;
  }

  const { project, columns } = boardQuery.data;
  const projectPresence = presence.filter((p) => p.project_id === project.id).map((p) => p.user);
  const hasActiveFilters = Boolean(
    filters.q || filters.assignee_id || filters.priority || filters.label_id || filters.due,
  );

  return (
    <div className="flex h-full flex-col">
      <div aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: project.color }} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-bold">{project.name}</h1>
              <span className="rounded bg-[var(--muted-bg)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                {project.key}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {projectPresence.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
              <AvatarStack users={projectPresence} max={4} size="xs" />
            </div>
          )}

          <SegmentedControl
            layoutId="board-view-toggle"
            value={viewMode}
            onChange={(v) => setParam('view', v === 'list' ? 'list' : null)}
            options={[
              { value: 'board', label: 'Board' },
              { value: 'list', label: 'List' },
            ]}
          />

          {project.can_manage && (
            <Link to={`/w/${org.slug}/projects/${project.id}/settings`}>
              <Button variant="secondary" size="sm">
                <Settings className="h-3.5 w-3.5" /> Settings
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-52">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <Input
            aria-label="Filter tasks"
            placeholder="Filter tasks…"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setParam('q', e.target.value || null);
            }}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="w-36">
          <SelectField
            aria-label="Filter by assignee"
            value={searchParams.get('assignee_id') ?? 'all'}
            onValueChange={(v) => setParam('assignee_id', v === 'all' ? null : v)}
            options={[
              { value: 'all', label: 'All assignees' },
              { value: 'me', label: 'Assigned to me' },
              { value: 'none', label: 'Unassigned' },
              ...(membersQuery.data ?? []).map((m) => ({
                value: m.user.id,
                label: m.user.display_name,
              })),
            ]}
            className="h-8"
          />
        </div>

        <div className="w-32">
          <SelectField
            aria-label="Filter by priority"
            value={searchParams.get('priority') ?? 'all'}
            onValueChange={(v) => setParam('priority', v === 'all' ? null : v)}
            options={[
              { value: 'all', label: 'All priorities' },
              { value: 'urgent', label: 'Urgent' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
            className="h-8"
          />
        </div>

        <div className="w-32">
          <SelectField
            aria-label="Filter by label"
            value={searchParams.get('label_id') ?? 'all'}
            onValueChange={(v) => setParam('label_id', v === 'all' ? null : v)}
            options={[
              { value: 'all', label: 'All labels' },
              ...(labelsQuery.data ?? []).map((lb) => ({ value: lb.id, label: lb.name })),
            ]}
            className="h-8"
          />
        </div>

        {/* Saved views */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm" className="h-8">
              <Bookmark className="h-3.5 w-3.5" /> Views
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-3">
            <p className="text-xs font-semibold">Saved views</p>
            {(viewsQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No saved views yet.</p>
            ) : (
              <div className="space-y-1">
                {viewsQuery.data!.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-[var(--muted-bg)]"
                  >
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => {
                        const next = new URLSearchParams();
                        Object.entries(v.filters).forEach(([k, val]) => {
                          if (val) next.set(k, String(val));
                        });
                        setSearchInput(v.filters.q ?? '');
                        setSearchParams(next, { replace: true });
                      }}
                    >
                      {v.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete view ${v.name}`}
                      onClick={() => deleteViewMutation.mutate(v.id)}
                      className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form
              className="flex gap-1.5 border-t border-[var(--border)] pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!viewName.trim()) return;
                saveViewMutation.mutate(viewName.trim());
              }}
            >
              <Input
                placeholder="Save current filters…"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" loading={saveViewMutation.isPending}>
                Save
              </Button>
            </form>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setSearchInput('');
              setSearchParams(viewMode === 'list' ? { view: 'list' } : {}, { replace: true });
            }}
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Board or List view */}
      {viewMode === 'board' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
            {columns.map((col) => (
              <BoardColumn
                key={col.id}
                column={col}
                allColumns={columns}
                canEdit={project.can_edit}
                flashedTaskIds={flashedTaskIds}
                onOpenTask={(tid) => setParam('task', tid)}
                onMoveTo={handleMoveTo}
                onKeyboardStep={handleKeyboardStep}
                onQuickAdd={async (colId, title) => {
                  await createTaskMutation.mutateAsync({ columnId: colId, title });
                }}
              />
            ))}
          </div>

          <DragOverlay>
            {activeDragTask ? <TaskCardVisual task={activeDragTask} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <div className="w-44">
              <SelectField
                aria-label="Sort tasks"
                value={listSort}
                onValueChange={setListSort}
                options={[
                  { value: '-updated_at', label: 'Recently updated' },
                  { value: 'priority', label: 'Priority' },
                  { value: 'due_at', label: 'Due date (soonest)' },
                  { value: '-created_at', label: 'Newest created' },
                ]}
              />
            </div>
          </div>

          {listQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (listQuery.data?.items ?? []).length === 0 ? (
            <EmptyState
              title="No matching tasks"
              description="Try adjusting your filters or switch to Board view to create a task."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border)] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Key</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">Assignee</th>
                    <th className="px-4 py-3 font-medium">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {listQuery.data!.items.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setParam('task', t.id)}
                      className="cursor-pointer hover:bg-[var(--muted-bg)]/60"
                    >
                      <td className="px-4 py-3 font-mono text-[var(--text-muted)]">{t.key}</td>
                      <td className="px-4 py-3 font-medium">{t.title}</td>
                      <td className="px-4 py-3">
                        <PriorityBadge priority={t.priority} />
                      </td>
                      <td className="px-4 py-3">
                        {t.assignee ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Avatar user={t.assignee} size="xs" />
                            {t.assignee.display_name}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">Unassigned</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3',
                          isOverdue(t.due_at, t.completed_at)
                            ? 'font-medium text-[var(--danger)]'
                            : 'text-[var(--text-muted)]',
                        )}
                      >
                        {t.due_at ? formatShortDate(t.due_at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {listQuery.data && listQuery.data.pages > 1 && (
            <div className="flex justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={listPage <= 1}
                onClick={() => setListPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={listPage >= listQuery.data.pages}
                onClick={() => setListPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      <TaskDrawer
        projectId={project.id}
        taskId={activeTaskId}
        project={project}
        orgId={org.id}
        onClose={() => setParam('task', null)}
      />
    </div>
  );
}
