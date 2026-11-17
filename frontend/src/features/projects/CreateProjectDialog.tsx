import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ProjectDetail } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { FormField, Input, Textarea } from '@/components/ui/Input';

const COLORS = ['#C6F432', '#38BDF8', '#A78BFA', '#FB923C', '#10B981', '#F43F5E'];

function deriveKey(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (letters.length >= 3) return letters.slice(0, 3);
  if (letters.length >= 2) return letters;
  return 'PRJ';
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  orgId,
  orgSlug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgSlug: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<ProjectDetail>(`/api/v1/organizations/${orgId}/projects`, {
        name: name.trim(),
        key: key.trim() || undefined,
        description: description.trim(),
        color,
      }),
    onSuccess: (proj) => {
      qc.invalidateQueries({ queryKey: ['org', orgId, 'projects'] });
      toast.success(`Created project ${proj.name}`);
      onOpenChange(false);
      setName('');
      setKey('');
      setKeyEdited(false);
      setDescription('');
      navigate(`/w/${orgSlug}/projects/${proj.id}`);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Failed to create project');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New project"
        description="Creates a Kanban board with Backlog, To Do, In Progress, In Review, and Done columns."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (!name.trim()) {
              setError('Project name is required');
              return;
            }
            mutation.mutate();
          }}
        >
          {error && (
            <p role="alert" className="text-xs text-[var(--danger)]">
              {error}
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <FormField label="Project name" htmlFor="proj-name">
                <Input
                  id="proj-name"
                  placeholder="e.g. Website Relaunch"
                  value={name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setName(val);
                    if (!keyEdited) setKey(deriveKey(val));
                  }}
                />
              </FormField>
            </div>
            <FormField label="Key" htmlFor="proj-key" hint="2-6 letters">
              <Input
                id="proj-key"
                value={key}
                maxLength={6}
                className="font-mono uppercase"
                onChange={(e) => {
                  setKeyEdited(true);
                  setKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''));
                }}
              />
            </FormField>
          </div>

          <FormField label="Description" htmlFor="proj-desc">
            <Textarea
              id="proj-desc"
              placeholder="What is this project delivering?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium">Accent color</span>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Select color ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 rounded-full transition-transform',
                    color === c ? 'scale-110 ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--elevated)]' : 'opacity-80 hover:opacity-100',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Create project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

