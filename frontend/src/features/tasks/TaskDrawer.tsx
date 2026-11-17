import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Eye, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useCopy } from '@/lib/hooks';
import { renderSafeMarkdown } from '@/lib/markdown';
import { queryKeys } from '@/lib/queryKeys';
import { formatActivitySentence, formatRelativeTime } from '@/lib/utils';
import type {
  ActivityEvent,
  Comment,
  CursorResponse,
  Label,
  Member,
  Priority,
  ProjectDetail,
  Subtask,
  TaskDetail,
} from '@/lib/types';
import { useAuthStore } from '@/features/auth/store';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog, DrawerContent } from '@/components/ui/Dialog';
import { Input, Textarea } from '@/components/ui/Input';
import { Popover, PopoverContent, PopoverTrigger, SelectField } from '@/components/ui/Overlays';
import { ErrorState, Skeleton } from '@/components/ui/States';

export function TaskDrawer({
  projectId,
  taskId,
  project,
  orgId,
  onClose,
}: {
  projectId: string;
  taskId: string | null;
  project: ProjectDetail;
  orgId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const { copied, copy } = useCopy();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [previewDesc, setPreviewDesc] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [newComment, setNewComment] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const taskQuery = useQuery({
    queryKey: taskId ? queryKeys.task(projectId, taskId) : ['no-task'],
    enabled: Boolean(taskId),
    queryFn: () => api.get<TaskDetail>(`/api/v1/projects/${projectId}/tasks/${taskId}`),
  });

  const commentsQuery = useQuery({
    queryKey: taskId ? queryKeys.comments(taskId) : ['no-comments'],
    enabled: Boolean(taskId),
    queryFn: () => api.get<CursorResponse<Comment>>(`/api/v1/tasks/${taskId}/comments?limit=50`),
  });

  const membersQuery = useQuery({
    queryKey: queryKeys.members(orgId),
    queryFn: () => api.get<Member[]>(`/api/v1/organizations/${orgId}/members`),
  });

  const labelsQuery = useQuery({
    queryKey: queryKeys.labels(orgId),
    queryFn: () => api.get<Label[]>(`/api/v1/organizations/${orgId}/labels`),
  });

  const activityQuery = useQuery({
    queryKey: queryKeys.projectActivity(projectId),
    enabled: Boolean(taskId),
    queryFn: () =>
      api.get<CursorResponse<ActivityEvent>>(`/api/v1/projects/${projectId}/activity?limit=30`),
  });

  useEffect(() => {
    if (taskQuery.data) {
      setTitle(taskQuery.data.title);
      setDescription(taskQuery.data.description);
    }
  }, [taskQuery.data]);

  const patchTask = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      setSaveState('saving');
      return api.patch<TaskDetail>(`/api/v1/projects/${projectId}/tasks/${taskId}`, {
        version: taskQuery.data!.version,
        ...payload,
      });
    },
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.task(projectId, taskId!), updated);
      qc.invalidateQueries({ queryKey: ['project', projectId, 'board'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'tasks'] });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    },
    onError: (err) => {
      setSaveState('idle');
      if (err instanceof ApiError && err.code === 'stale_update') {
        toast.warning('Someone else changed this task — refreshed');
        qc.invalidateQueries({ queryKey: queryKeys.task(projectId, taskId!) });
        qc.invalidateQueries({ queryKey: ['project', projectId, 'board'] });
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Failed to save');
      }
    },
  });

  const moveColumn = useMutation({
    mutationFn: (columnId: string) =>
      api.post(`/api/v1/projects/${projectId}/tasks/${taskId}/move`, {
        column_id: columnId,
        index: 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.task(projectId, taskId!) });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'board'] });
    },
  });

  const addSubtask = useMutation({
    mutationFn: (stTitle: string) =>
      api.post<Subtask>(`/api/v1/tasks/${taskId}/subtasks`, { title: stTitle }),
    onSuccess: () => {
      setNewSubtask('');
      qc.invalidateQueries({ queryKey: queryKeys.task(projectId, taskId!) });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'board'] });
    },
  });

  const toggleSubtask = useMutation({
    mutationFn: ({ subId, is_done }: { subId: string; is_done: boolean }) =>
      api.patch<Subtask>(`/api/v1/tasks/${taskId}/subtasks/${subId}`, { is_done }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.task(projectId, taskId!) });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'board'] });
    },
  });

  const deleteSubtask = useMutation({
    mutationFn: (subId: string) => api.delete(`/api/v1/tasks/${taskId}/subtasks/${subId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.task(projectId, taskId!) });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'board'] });
    },
  });

  const addComment = useMutation({
    mutationFn: (body: string) =>
      api.post<Comment>(`/api/v1/tasks/${taskId}/comments`, { body }),
    onSuccess: () => {
      setNewComment('');
      qc.invalidateQueries({ queryKey: queryKeys.comments(taskId!) });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'board'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Comment failed'),
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) => api.delete(`/api/v1/tasks/${taskId}/comments/${commentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.comments(taskId!) });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'board'] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: () => api.delete(`/api/v1/projects/${projectId}/tasks/${taskId}`),
    onSuccess: () => {
      toast.success('Task deleted');
      setDeleteOpen(false);
      onClose();
      qc.invalidateQueries({ queryKey: ['project', projectId, 'board'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'tasks'] });
    },
  });

  const task = taskQuery.data;
  const canEdit = project.can_edit;
  const subtasks = task?.subtasks ?? [];
  const doneSubtasks = subtasks.filter((s) => s.is_done).length;
  const subPct = subtasks.length > 0 ? Math.round((doneSubtasks / subtasks.length) * 100) : 0;

  const taskEvents = (activityQuery.data?.items ?? []).filter((e) => e.entity_id === taskId);

  return (
    <Dialog open={Boolean(taskId)} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent title={task ? `${task.key} ${task.title}` : 'Task detail'}>
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-semibold text-[var(--accent-text)]">
              {task?.key ?? '…'}
            </span>
            <span aria-live="polite" className="text-xs text-[var(--text-muted)]">
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                copy(window.location.href);
                toast.success('Task link copied');
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            {canEdit && task && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete task"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 text-[var(--danger)]" />
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Close drawer" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {taskQuery.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : taskQuery.isError || !task ? (
            <ErrorState onRetry={() => taskQuery.refetch()} />
          ) : (
            <div className="space-y-6">
              {/* Title */}
              <input
                aria-label="Task title"
                disabled={!canEdit}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title.trim() && title.trim() !== task.title) {
                    patchTask.mutate({ title: title.trim() });
                  }
                }}
                className="w-full bg-transparent font-display text-xl font-bold text-[var(--text)] focus:outline-none disabled:opacity-90"
              />

              {/* Properties grid */}
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 sm:grid-cols-4">
                <div>
                  <span className="mb-1 block text-[11px] text-[var(--text-muted)]">Column</span>
                  <SelectField
                    aria-label="Task column"
                    disabled={!canEdit}
                    value={task.column_id}
                    onValueChange={(cid) => moveColumn.mutate(cid)}
                    options={project.columns.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] text-[var(--text-muted)]">Priority</span>
                  <SelectField
                    aria-label="Task priority"
                    disabled={!canEdit}
                    value={task.priority}
                    onValueChange={(p) => patchTask.mutate({ priority: p as Priority })}
                    options={[
                      { value: 'urgent', label: 'Urgent' },
                      { value: 'high', label: 'High' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'low', label: 'Low' },
                      { value: 'none', label: 'None' },
                    ]}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] text-[var(--text-muted)]">Assignee</span>
                  <SelectField
                    aria-label="Task assignee"
                    disabled={!canEdit}
                    value={task.assignee?.id ?? 'unassigned'}
                    onValueChange={(val) =>
                      patchTask.mutate({ assignee_id: val === 'unassigned' ? null : val })
                    }
                    options={[
                      { value: 'unassigned', label: 'Unassigned' },
                      ...(membersQuery.data ?? []).map((m) => ({
                        value: m.user.id,
                        label: m.user.display_name,
                      })),
                    ]}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] text-[var(--text-muted)]">Due date</span>
                  <Input
                    type="date"
                    aria-label="Task due date"
                    disabled={!canEdit}
                    value={task.due_at ? task.due_at.slice(0, 10) : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      patchTask.mutate({
                        due_at: val ? new Date(`${val}T17:00:00Z`).toISOString() : null,
                      });
                    }}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* Labels */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">Labels:</span>
                {task.labels.map((lb) => (
                  <Badge key={lb.id} color={lb.color}>
                    {lb.name}
                  </Badge>
                ))}
                {canEdit && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="secondary" size="sm" className="h-6 px-2 text-[11px]">
                        <Plus className="h-3 w-3" /> Edit labels
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-56 p-2">
                      <div className="space-y-1">
                        {(labelsQuery.data ?? []).map((lb) => {
                          const active = task.labels.some((l) => l.id === lb.id);
                          return (
                            <button
                              key={lb.id}
                              type="button"
                              onClick={() => {
                                const nextIds = active
                                  ? task.labels.filter((l) => l.id !== lb.id).map((l) => l.id)
                                  : [...task.labels.map((l) => l.id), lb.id];
                                patchTask.mutate({ label_ids: nextIds });
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-[var(--muted-bg)]"
                            >
                              <span className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: lb.color }}
                                />
                                {lb.name}
                              </span>
                              {active && <Check className="h-3.5 w-3.5 text-[var(--accent-text)]" />}
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text)]">Description</span>
                  <button
                    type="button"
                    onClick={() => setPreviewDesc((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    {previewDesc ? (
                      <>
                        <Pencil className="h-3 w-3" /> Edit
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" /> Preview
                      </>
                    )}
                  </button>
                </div>
                {previewDesc ? (
                  <div
                    className="min-h-[84px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)]"
                    dangerouslySetInnerHTML={{
                      __html:
                        renderSafeMarkdown(description) ||
                        '<span class="text-[var(--text-muted)]">No description.</span>',
                    }}
                  />
                ) : (
                  <Textarea
                    aria-label="Task description"
                    disabled={!canEdit}
                    placeholder="Add markdown details, acceptance criteria, or links…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => {
                      if (description !== task.description) {
                        patchTask.mutate({ description });
                      }
                    }}
                  />
                )}
              </div>

              {/* Subtasks */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    Subtasks ({doneSubtasks}/{subtasks.length})
                  </span>
                  {subtasks.length > 0 && (
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      {subPct}%
                    </span>
                  )}
                </div>
                {subtasks.length > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted-bg)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                      style={{ width: `${subPct}%` }}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  {subtasks.map((st) => (
                    <div
                      key={st.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
                    >
                      <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          disabled={!canEdit}
                          checked={st.is_done}
                          onChange={(e) =>
                            toggleSubtask.mutate({ subId: st.id, is_done: e.target.checked })
                          }
                          className="h-3.5 w-3.5 accent-[var(--accent)]"
                        />
                        <span className={st.is_done ? 'text-[var(--text-muted)] line-through' : ''}>
                          {st.title}
                        </span>
                      </label>
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={`Delete subtask ${st.title}`}
                          onClick={() => deleteSubtask.mutate(st.id)}
                          className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newSubtask.trim()) return;
                      addSubtask.mutate(newSubtask.trim());
                    }}
                  >
                    <Input
                      placeholder="Add a subtask…"
                      value={newSubtask}
                      onChange={(e) => setNewSubtask(e.target.value)}
                    />
                    <Button type="submit" size="sm" variant="secondary" loading={addSubtask.isPending}>
                      Add
                    </Button>
                  </form>
                )}
              </div>

              {/* Comments */}
              <div className="space-y-3 border-t border-[var(--border)] pt-5">
                <h3 className="text-xs font-semibold">
                  Comments ({commentsQuery.data?.items.length ?? 0})
                </h3>
                <div className="space-y-3">
                  {(commentsQuery.data?.items ?? []).map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs"
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar user={c.author} size="xs" />
                          <span className="font-medium text-[var(--text)]">
                            {c.author.display_name}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {formatRelativeTime(c.created_at)}
                            {c.edited ? ' (edited)' : ''}
                          </span>
                        </div>
                        {(c.author.id === me?.id ||
                          project.my_org_role === 'owner' ||
                          project.my_org_role === 'admin') && (
                          <button
                            type="button"
                            aria-label="Delete comment"
                            onClick={() => deleteComment.mutate(c.id)}
                            className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-[var(--text)]">{c.body}</p>
                    </div>
                  ))}
                </div>

                {canEdit && (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newComment.trim()) return;
                      addComment.mutate(newComment.trim());
                    }}
                  >
                    <Input
                      aria-label="Write a comment"
                      placeholder="Write a comment…"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                    />
                    <Button type="submit" size="sm" loading={addComment.isPending}>
                      <Send className="h-3.5 w-3.5" /> Comment
                    </Button>
                  </form>
                )}
              </div>

              {/* Task activity */}
              {taskEvents.length > 0 && (
                <div className="space-y-2 border-t border-[var(--border)] pt-4">
                  <h3 className="text-xs font-semibold text-[var(--text-muted)]">Activity</h3>
                  <div className="space-y-1.5">
                    {taskEvents.map((ev) => (
                      <p key={ev.id} className="text-xs text-[var(--text-muted)]">
                        {formatActivitySentence(ev)} · {formatRelativeTime(ev.created_at)}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DrawerContent>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete task?"
        description="This permanently deletes the task and all its subtasks and comments."
        confirmLabel="Delete task"
        loading={deleteTask.isPending}
        onConfirm={() => deleteTask.mutate()}
      />
    </Dialog>
  );
}

