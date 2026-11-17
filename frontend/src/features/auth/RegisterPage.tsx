import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import type { AuthResponse } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/Input';
import { AuthLayout } from './AuthLayout';
import { useAuthStore } from './store';

const registerSchema = z.object({
  display_name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Must contain at least one letter')
    .regex(/\d/, 'Must contain at least one digit'),
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (values: RegisterValues) => {
    setServerError(null);
    try {
      const res = await api.post<AuthResponse>('/api/v1/auth/register', values, {
        skipAuth: true,
      });
      setSession(res.access_token, res.user);
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Unable to register');
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Start organizing projects in seconds">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError && (
          <div
            role="alert"
            className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]"
          >
            {serverError}
          </div>
        )}

        <FormField label="Full name" htmlFor="reg-name" error={errors.display_name?.message}>
          <Input
            id="reg-name"
            placeholder="Alex Rivera"
            autoComplete="name"
            {...register('display_name')}
          />
        </FormField>

        <FormField label="Work email" htmlFor="reg-email" error={errors.email?.message}>
          <Input
            id="reg-email"
            type="email"
            placeholder="alex@company.com"
            autoComplete="email"
            {...register('email')}
          />
        </FormField>

        <FormField
          label="Password"
          htmlFor="reg-password"
          error={errors.password?.message}
          hint="8+ characters with at least one letter and one digit"
        >
          <Input
            id="reg-password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register('password')}
          />
        </FormField>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>

        <p className="pt-2 text-center text-xs text-[var(--text-muted)]">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-[var(--accent-text)] hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

