import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { Column, ProjectDetail, ProjectStatus } from '@/lib/types';
import { useCurrentOrg } from '@/features/organizations/useCurrentOrg';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { FormField, Input, Textarea } from '@/components/ui/Input';
import { SelectField, Switch } from '@/components/ui/Overlays';
import { ErrorState, PageHeader, PermissionDenied, Skeleton } from '@/components/ui/States';

export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { org } = useCurrentOrg();

  const projQuery = useQuery({
    queryKey: projectId ? queryKeys.project(projectId) : ['no-project'],
    enabled: Boolean(projectId),
    queryFn: () => api.get<ProjectDetail>(`/api/v1/projects/${projectId}`),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [newColName, setNewColName] = useState('');
  const [newColDone, setNewColDone] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (projQuery.data) {
      setName(projQuery.data.name);
      setDescription(projQuery.data.description);
      setStatus(projQuery.data.status);
    }
  }, [projQuery.data]);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch<ProjectDetail>(`/api/v1/projects/${projectId}`, {
        name: name.trim(),
        description,
        status,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Project updated');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Update failed'),
  });

  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) =>
      api.post<ProjectDetail>(
        `/api/v1/projects/${projectId}/${archived ? 'archive' : 'unarchive'}`,
      ),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success(p.archived_at ? 'Project archived' : 'Project restored');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/projects/${projectId}`),
    onSuccess: () => {
      if (org) {
        qc.invalidateQueries({ queryKey: ['org', org.id, 'projects'] });
        navigate(`/w/${org.slug}/projects`, { replace: true });
      }
      toast.success('Project deleted');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Delete failed'),
  });

  const addColMutation = useMutation({
    mutationFn: () =>
      api.post<Column>(`/api/v1/projects/${projectId}/columns`, {
        name: newColName.trim(),
        is_done: newColDone,
      }),
    onSuccess: () => {
      setNewColName('');
      setNewColDone(false);
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Column added');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to add column'),
  });

  const reorderColsMutation = useMutation({
    mutationFn: (column_ids: string[]) =>
      api.post(`/api/v1/projects/${projectId}/columns/reorder`, { column_ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  });

  const deleteColMutation = useMutation({
    mutationFn: ({ colId, moveTo }: { colId: string; moveTo?: string }) =>
      api.delete(
        `/api/v1/projects/${projectId}/columns/${colId}${moveTo ? `?move_to=${moveTo}` : ''}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Column deleted');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Cannot delete column'),
  });

  if (projQuery.isLoading) return <Skeleton className="h-64 w-full" />;
  if (projQuery.isError || !projQuery.data || !org) {
    return <ErrorState onRetry={() => projQuery.refetch()} />;
  }

  const project = projQuery.data;
  if (!project.can_manage) {
    return <PermissionDenied message="Only project leads or workspace admins can edit project settings." />;
  }

  const moveCol = (index: number, delta: number) => {
    const ids = project.columns.map((c) => c.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    const copy = [...ids];
    const [removed] = copy.splice(index, 1);
    copy.splice(target, 0, removed);
    reorderColsMutation.mutate(copy);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          to={`/w/${org.slug}/projects/${project.id}`}
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to board
        </Link>
        <PageHeader title={`${project.name} — Settings`} subtitle={`Key: ${project.key}`} />
      </div>

      {/* General settings */}
      <form
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        onSubmit={(e) => {
          e.preventDefault();
          updateMutation.mutate();
        }}
      >
        <h2 className="font-display text-base font-semibold">General</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Project name" htmlFor="ps-name">
            <Input id="ps-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Status">
            <SelectField
              aria-label="Project status"
              value={status}
              onValueChange={(v) => setStatus(v as ProjectStatus)}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
          </FormField>
        </div>
        <FormField label="Description" htmlFor="ps-desc">
          <Textarea id="ps-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={updateMutation.isPending}>
            Save changes
          </Button>
        </div>
      </form>

      {/* Columns */}
      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-display text-base font-semibold">Board columns</h2>
        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {project.columns.map((col, idx) => {
            const fallbackCol = project.columns.find((c) => c.id !== col.id);
            return (
              <div key={col.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: col.color ?? '#71717A' }}
                  />
                  <span className="font-medium">{col.name}</span>
                  {col.is_done && (
                    <span className="rounded bg-[var(--success)]/15 px-1.5 py-0.5 font-mono text-[10px] text-[var(--success)]">
                      done
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${col.name} up`}
                    disabled={idx === 0}
                    onClick={() => moveCol(idx, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${col.name} down`}
                    disabled={idx === project.columns.length - 1}
                    onClick={() => moveCol(idx, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  {project.columns.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${col.name}`}
                      onClick={() =>
                        deleteColMutation.mutate({ colId: col.id, moveTo: fallbackCol?.id })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <form
          className="flex flex-wrap items-center gap-3 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newColName.trim()) return;
            addColMutation.mutate();
          }}
        >
          <Input
            placeholder="New column name…"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            className="w-56"
          />
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Switch checked={newColDone} onCheckedChange={setNewColDone} />
            Marks tasks done
          </label>
          <Button type="submit" size="sm" variant="secondary" loading={addColMutation.isPending}>
            <Plus className="h-3.5 w-3.5" /> Add column
          </Button>
        </form>
      </div>

      {/* Danger / Archive */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--surface)] p-5">
        <div>
          <h2 className="font-display text-base font-semibold">Archive or delete</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Archiving hides the project from active lists; deleting permanently removes all tasks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={archiveMutation.isPending}
            onClick={() => archiveMutation.mutate(!project.archived_at)}
          >
            <Archive className="h-3.5 w-3.5" />
            {project.archived_at ? 'Unarchive' : 'Archive'}
          </Button>
          {(org.role === 'owner' || org.role === 'admin') && (
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete project
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete project?"
        description={`This will permanently delete ${project.name} and all of its tasks, subtasks, and comments.`}
        confirmLabel="Delete project"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}

