import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useCopy } from '@/lib/hooks';
import { queryKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import type {
  Invitation,
  Label,
  Member,
  NotificationPreferences,
  OrgRole,
  OrganizationSummary,
  User,
} from '@/lib/types';
import { useAuthStore } from '@/features/auth/store';
import { useCurrentOrg } from '@/features/organizations/useCurrentOrg';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { FormField, Input } from '@/components/ui/Input';
import { SelectField, Switch } from '@/components/ui/Overlays';
import { PageHeader, PermissionDenied, Skeleton } from '@/components/ui/States';

const AVATAR_SWATCHES = ['#C6F432', '#38BDF8', '#A78BFA', '#FB923C', '#10B981', '#F43F5E'];

export function SettingsLayout() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const tabs = [
    { to: 'profile', label: 'Profile' },
    { to: 'security', label: 'Security' },
    { to: 'notifications', label: 'Notifications' },
    { to: 'workspace', label: 'Workspace' },
    { to: 'members', label: 'Members & Invites' },
    { to: 'labels', label: 'Labels' },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" subtitle="Manage your profile, preferences, and workspace." />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--border)] pb-2">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={`/w/${orgSlug}/settings/${t.to}`}
            className={({ isActive }) =>
              cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-[var(--muted-bg)] text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

export function ProfileSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const theme = useAuthStore((s) => s.theme);
  const setTheme = useAuthStore((s) => s.setTheme);
  const reduceMotion = useAuthStore((s) => s.reduceMotion);
  const setReduceMotion = useAuthStore((s) => s.setReduceMotion);

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [avatarColor, setAvatarColor] = useState(user?.avatar_color ?? AVATAR_SWATCHES[0]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name);
      setAvatarColor(user.avatar_color);
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<User>('/api/v1/users/me', {
        display_name: displayName.trim(),
        avatar_color: avatarColor,
      }),
    onSuccess: (updated) => {
      setUser(updated);
      toast.success('Profile saved');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Save failed'),
  });

  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!displayName.trim()) return;
          mutation.mutate();
        }}
      >
        <h2 className="font-display text-base font-semibold">Profile</h2>
        <FormField label="Display name" htmlFor="prof-name">
          <Input
            id="prof-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </FormField>
        <div>
          <span className="mb-2 block text-xs font-medium">Avatar color</span>
          <div className="flex gap-2">
            {AVATAR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Select avatar color ${c}`}
                onClick={() => setAvatarColor(c)}
                className={cn(
                  'h-7 w-7 rounded-full',
                  avatarColor === c && 'ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--surface)]',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={mutation.isPending}>
            Save profile
          </Button>
        </div>
      </form>

      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-display text-base font-semibold">Appearance & Accessibility</h2>
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="font-medium">Dark theme</p>
            <p className="text-xs text-[var(--text-muted)]">Switch between dark and light surface modes.</p>
          </div>
          <Switch
            aria-label="Dark theme"
            checked={theme === 'dark'}
            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="font-medium">Reduce motion</p>
            <p className="text-xs text-[var(--text-muted)]">Minimize animations across the workspace.</p>
          </div>
          <Switch
            aria-label="Reduce motion"
            checked={reduceMotion}
            onCheckedChange={setReduceMotion}
          />
        </div>
      </div>
    </div>
  );
}

export function SecuritySettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/api/v1/users/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Password updated');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Password change failed'),
  });

  return (
    <form
      className="max-w-md space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h2 className="font-display text-base font-semibold">Change password</h2>
      <FormField label="Current password" htmlFor="cur-pw">
        <Input
          id="cur-pw"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </FormField>
      <FormField label="New password" htmlFor="new-pw" hint="8+ characters with a letter and digit">
        <Input
          id="new-pw"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </FormField>
      <Button type="submit" size="sm" loading={mutation.isPending}>
        Update password
      </Button>
    </form>
  );
}

export function NotificationSettingsPage() {
  const qc = useQueryClient();
  const prefsQuery = useQuery({
    queryKey: queryKeys.notificationPrefs,
    queryFn: () => api.get<NotificationPreferences>('/api/v1/users/me/notification-preferences'),
  });

  const mutation = useMutation({
    mutationFn: (next: NotificationPreferences) =>
      api.put<NotificationPreferences>('/api/v1/users/me/notification-preferences', next),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.notificationPrefs, updated);
      toast.success('Preferences saved');
    },
  });

  if (prefsQuery.isLoading || !prefsQuery.data) return <Skeleton className="h-48 w-full" />;
  const prefs = prefsQuery.data;

  const items: { key: keyof NotificationPreferences; label: string; desc: string }[] = [
    { key: 'on_assigned', label: 'Task assignments', desc: 'When someone assigns a task to you.' },
    { key: 'on_comment', label: 'Comments', desc: 'When someone comments on a task you created or own.' },
    {
      key: 'on_status_change',
      label: 'Status changes',
      desc: 'When your task moves to another column.',
    },
    { key: 'on_invitation', label: 'Invitations', desc: 'When you are invited to another workspace.' },
  ];

  return (
    <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5">
      {items.map((item) => (
        <div key={item.key} className="flex items-center justify-between py-4 text-sm">
          <div>
            <p className="font-medium">{item.label}</p>
            <p className="text-xs text-[var(--text-muted)]">{item.desc}</p>
          </div>
          <Switch
            aria-label={item.label}
            checked={prefs[item.key]}
            onCheckedChange={(checked) => mutation.mutate({ ...prefs, [item.key]: checked })}
          />
        </div>
      ))}
    </div>
  );
}

export function WorkspaceSettingsPage() {
  const { org } = useCurrentOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState(org?.name ?? '');
  const [confirmName, setConfirmName] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (org) setName(org.name);
  }, [org]);

  const renameMutation = useMutation({
    mutationFn: () =>
      api.patch<OrganizationSummary>(`/api/v1/organizations/${org!.id}`, { name: name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.orgs });
      toast.success('Workspace renamed');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Rename failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/organizations/${org!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.orgs });
      toast.success('Workspace deleted');
      navigate('/onboarding', { replace: true });
    },
  });

  if (!org) return null;
  if (org.role !== 'owner' && org.role !== 'admin') {
    return <PermissionDenied message="Only workspace owners and admins can manage workspace settings." />;
  }

  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          renameMutation.mutate();
        }}
      >
        <h2 className="font-display text-base font-semibold">Workspace details</h2>
        <FormField label="Workspace name" htmlFor="org-name">
          <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={renameMutation.isPending}>
            Save workspace
          </Button>
        </div>
      </form>

      {org.role === 'owner' && (
        <div className="space-y-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--surface)] p-5">
          <h2 className="font-display text-base font-semibold text-[var(--danger)]">Danger zone</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Type <span className="font-mono font-semibold text-[var(--text)]">{org.name}</span> to
            permanently delete this workspace and all projects.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder={org.name}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="w-64"
            />
            <Button
              variant="danger"
              size="sm"
              disabled={confirmName !== org.name}
              onClick={() => setDeleteOpen(true)}
            >
              Delete workspace
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete workspace?"
        description={`This permanently deletes ${org.name} and all data inside it.`}
        confirmLabel="Delete workspace"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}

export function MembersSettingsPage() {
  const { org } = useCurrentOrg();
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { copied, copy } = useCopy();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: org ? queryKeys.members(org.id) : ['no-members'],
    enabled: Boolean(org?.id),
    queryFn: () => api.get<Member[]>(`/api/v1/organizations/${org!.id}/members`),
  });

  const isAdmin = org?.role === 'owner' || org?.role === 'admin';
  const invitesQuery = useQuery({
    queryKey: org ? queryKeys.invitations(org.id) : ['no-invites'],
    enabled: Boolean(org?.id) && isAdmin,
    queryFn: () => api.get<Invitation[]>(`/api/v1/organizations/${org!.id}/invitations`),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      api.post<Invitation>(`/api/v1/organizations/${org!.id}/invitations`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      }),
    onSuccess: (inv) => {
      setInviteEmail('');
      setLastInviteUrl(inv.invite_url);
      qc.invalidateQueries({ queryKey: queryKeys.invitations(org!.id) });
      toast.success(`Invited ${inv.email}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Invite failed'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrgRole }) =>
      api.patch(`/api/v1/organizations/${org!.id}/members/${userId}`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members(org!.id) });
      toast.success('Role updated');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Role update failed'),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/api/v1/organizations/${org!.id}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.members(org!.id) });
      toast.success('Member removed');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Remove failed'),
  });

  const revokeMutation = useMutation({
    mutationFn: (invId: string) =>
      api.delete(`/api/v1/organizations/${org!.id}/invitations/${invId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.invitations(org!.id) });
      toast.info('Invitation revoked');
    },
  });

  if (!org) return null;

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-display text-base font-semibold">Invite teammate</h2>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!inviteEmail.trim()) return;
              inviteMutation.mutate();
            }}
          >
            <Input
              type="email"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-64"
            />
            <div className="w-32">
              <SelectField
                aria-label="Invitation role"
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as 'admin' | 'member' | 'viewer')}
                options={[
                  { value: 'admin', label: 'Admin' },
                  { value: 'member', label: 'Member' },
                  { value: 'viewer', label: 'Viewer' },
                ]}
              />
            </div>
            <Button type="submit" size="sm" loading={inviteMutation.isPending}>
              Send invite
            </Button>
          </form>

          {lastInviteUrl && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-xs">
              <span className="truncate font-mono">{lastInviteUrl}</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  copy(lastInviteUrl);
                  toast.success('Invite link copied');
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {(membersQuery.data ?? []).map((m) => (
          <div key={m.user.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
            <div className="flex items-center gap-3">
              <Avatar user={m.user} size="sm" />
              <div>
                <p className="font-medium text-[var(--text)]">{m.user.display_name}</p>
                <p className="text-[var(--text-muted)]">{m.user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && m.user.id !== me?.id ? (
                <div className="w-28">
                  <SelectField
                    aria-label={`Role for ${m.user.display_name}`}
                    value={m.role}
                    onValueChange={(r) => roleMutation.mutate({ userId: m.user.id, role: r as OrgRole })}
                    options={[
                      ...(org.role === 'owner' ? [{ value: 'owner', label: 'Owner' }] : []),
                      { value: 'admin', label: 'Admin' },
                      { value: 'member', label: 'Member' },
                      { value: 'viewer', label: 'Viewer' },
                    ]}
                  />
                </div>
              ) : (
                <span className="rounded bg-[var(--muted-bg)] px-2 py-1 font-mono capitalize">
                  {m.role}
                </span>
              )}
              {(isAdmin || m.user.id === me?.id) && m.role !== 'owner' && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${m.user.display_name}`}
                  onClick={() => removeMutation.mutate(m.user.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {isAdmin && (invitesQuery.data ?? []).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Pending invitations
          </h3>
          <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {invitesQuery.data!.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span>
                  {inv.email} <span className="font-mono text-[var(--text-muted)]">({inv.role})</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => revokeMutation.mutate(inv.id)}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function LabelsSettingsPage() {
  const { org } = useCurrentOrg();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState(AVATAR_SWATCHES[0]);

  const labelsQuery = useQuery({
    queryKey: org ? queryKeys.labels(org.id) : ['no-labels'],
    enabled: Boolean(org?.id),
    queryFn: () => api.get<Label[]>(`/api/v1/organizations/${org!.id}/labels`),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Label>(`/api/v1/organizations/${org!.id}/labels`, { name: name.trim(), color }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: queryKeys.labels(org!.id) });
      toast.success('Label created');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to create label'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/organizations/${org!.id}/labels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.labels(org!.id) }),
  });

  if (!org) return null;
  const canEdit = org.role !== 'viewer';

  return (
    <div className="space-y-5">
      {canEdit && (
        <form
          className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createMutation.mutate();
          }}
        >
          <Input
            placeholder="New label name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-52"
          />
          <div className="flex gap-1.5">
            {AVATAR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  'h-6 w-6 rounded-full',
                  color === c && 'ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--surface)]',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button type="submit" size="sm" loading={createMutation.isPending}>
            <Plus className="h-3.5 w-3.5" /> Add label
          </Button>
        </form>
      )}

      <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {(labelsQuery.data ?? []).map((lb) => (
          <div key={lb.id} className="flex items-center justify-between px-4 py-3 text-xs">
            <span className="flex items-center gap-2.5 font-medium">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: lb.color }} />
              {lb.name}
            </span>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete label ${lb.name}`}
                onClick={() => deleteMutation.mutate(lb.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

