import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { OrganizationSummary } from '@/lib/types';
import { useAuthStore } from '@/features/auth/store';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { Spinner } from '@/components/ui/States';

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Joining workspace…');

  useEffect(() => {
    if (!bootstrapped) return;
    if (!user) {
      navigate('/login', { state: { from: `/invite/${token}` }, replace: true });
      return;
    }
    if (!token) {
      setStatus('error');
      setMessage('Missing invitation token.');
      return;
    }

    api
      .post<OrganizationSummary>('/api/v1/invitations/accept-token', { token })
      .then((org) => {
        setStatus('success');
        setMessage(`You joined ${org.name}`);
        toast.success(`Joined ${org.name}`);
        setTimeout(() => navigate(`/w/${org.slug}`, { replace: true }), 800);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof ApiError ? err.message : 'Unable to accept invitation');
      });
  }, [bootstrapped, user, token, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-card">
        <div className="mb-4 flex justify-center">
          <Logo />
        </div>
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Spinner />
            <p className="text-sm text-[var(--text-muted)]">{message}</p>
          </div>
        )}
        {status === 'success' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="h-9 w-9 text-[var(--success)]" />
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <XCircle className="h-9 w-9 text-[var(--danger)]" />
            <p className="text-sm text-[var(--danger)]">{message}</p>
            <Link to="/onboarding">
              <Button variant="secondary" size="sm">
                Go to workspaces
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

