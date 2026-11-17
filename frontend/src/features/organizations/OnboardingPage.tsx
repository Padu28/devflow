import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Mail, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { MyInvitation, OrganizationSummary } from '@/lib/types';
import { useAuthStore } from '@/features/auth/store';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/Input';
import { Logo } from '@/components/ui/Logo';
import { Spinner } from '@/components/ui/States';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const lastOrgSlug = useAuthStore((s) => s.lastOrgSlug);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const orgsQuery = useQuery({
    queryKey: queryKeys.orgs,
    queryFn: () => api.get<OrganizationSummary[]>('/api/v1/organizations'),
  });

  const invitesQuery = useQuery({
    queryKey: queryKeys.myInvitations,
    queryFn: () => api.get<MyInvitation[]>('/api/v1/invitations'),
  });

  const createOrg = useMutation({
    mutationFn: (workspaceName: string) =>
      api.post<OrganizationSummary>('/api/v1/organizations', { name: workspaceName }),
    onSuccess: (org) => {
      qc.invalidateQueries({ queryKey: queryKeys.orgs });
      toast.success(`Created workspace "${org.name}"`);
      navigate(`/w/${org.slug}`, { replace: true });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Failed to create workspace');
    },
  });

  const acceptInvite = useMutation({
    mutationFn: (id: string) => api.post<OrganizationSummary>(`/api/v1/invitations/${id}/accept`),
    onSuccess: (org) => {
      qc.invalidateQueries({ queryKey: queryKeys.orgs });
      qc.invalidateQueries({ queryKey: queryKeys.myInvitations });
      toast.success(`Joined ${org.name}`);
      navigate(`/w/${org.slug}`, { replace: true });
    },
  });

  const declineInvite = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/invitations/${id}/decline`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.myInvitations });
      toast.info('Invitation declined');
    },
  });

  if (orgsQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <Spinner />
      </div>
    );
  }

  const orgs = orgsQuery.data ?? [];
  const invites = invitesQuery.data ?? [];

  if (orgs.length > 0 && invites.length === 0) {
    const preferred = orgs.find((o) => o.slug === lastOrgSlug) ?? orgs[0];
    navigate(`/w/${preferred.slug}`, { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-12">
      <div className="mx-auto max-w-lg space-y-8">
        <div className="flex items-center justify-between">
          <Logo />
          {orgs.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/w/${orgs[0].slug}`)}>
              Back to {orgs[0].name}
            </Button>
          )}
        </div>

        {invites.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <Mail className="h-4 w-4 text-[var(--accent-text)]" />
              Pending workspace invitations
            </h2>
            <div className="mt-3 space-y-2.5">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{inv.organization.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Invited by {inv.invited_by.display_name} as{' '}
                      <span className="font-mono">{inv.role}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Decline invitation to ${inv.organization.name}`}
                      onClick={() => declineInvite.mutate(inv.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => acceptInvite.mutate(inv.id)}
                      loading={acceptInvite.isPending}
                    >
                      <Check className="h-3.5 w-3.5" /> Join
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-card">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent-text)]">
            <Building2 className="h-5 w-5" />
          </div>
          <h1 className="font-display text-xl font-bold">Create a workspace</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            A workspace houses your team’s projects, Kanban boards, and activity history.
          </p>

          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (!name.trim()) {
                setError('Workspace name is required');
                return;
              }
              createOrg.mutate(name.trim());
            }}
          >
            <FormField label="Workspace name" htmlFor="ws-name" error={error ?? undefined}>
              <Input
                id="ws-name"
                placeholder="e.g. Acme Engineering"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormField>
            <Button type="submit" className="w-full" loading={createOrg.isPending}>
              Create workspace
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

