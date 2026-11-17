import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { AuthResponse, OrganizationSummary } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/Input';
import { AuthLayout } from './AuthLayout';
import { useAuthStore } from './store';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  const completeLogin = async (auth: AuthResponse) => {
    setSession(auth.access_token, auth.user);
    if (from && from !== '/login') {
      navigate(from, { replace: true });
      return;
    }
    const orgs = await api.get<OrganizationSummary[]>('/api/v1/organizations');
    if (orgs.length > 0) {
      navigate(`/w/${orgs[0].slug}`, { replace: true });
    } else {
      navigate('/onboarding', { replace: true });
    }
  };

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    try {
      const res = await api.post<AuthResponse>('/api/v1/auth/login', values, { skipAuth: true });
      await completeLogin(res);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Unable to sign in');
    }
  };

  const handleDemo = async () => {
    setServerError(null);
    setDemoLoading(true);
    try {
      const res = await api.post<AuthResponse>(
        '/api/v1/auth/login',
        { email: 'demo@devflow.dev', password: 'DemoPass123!' },
        { skipAuth: true },
      );
      toast.success('Signed in as Demo User');
      await completeLogin(res);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Demo login failed');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your DevFlow workspace">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError && (
          <div
            role="alert"
            className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]"
          >
            {serverError}
          </div>
        )}

        <FormField label="Email" htmlFor="login-email" error={errors.email?.message}>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            {...register('email')}
          />
        </FormField>

        <FormField label="Password" htmlFor="login-password" error={errors.password?.message}>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            {...register('password')}
          />
        </FormField>

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-[var(--border)]" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase">
            <span className="bg-[var(--bg)] px-2 text-[var(--text-muted)]">or</span>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full"
          loading={demoLoading}
          onClick={handleDemo}
        >
          <Zap className="h-3.5 w-3.5 text-[var(--accent-text)]" />
          Try the live demo
        </Button>

        <p className="pt-2 text-center text-xs text-[var(--text-muted)]">
          New to DevFlow?{' '}
          <Link to="/register" className="font-medium text-[var(--accent-text)] hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

