import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/Input';
import { AuthLayout } from './AuthLayout';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});

export default function ForgotPasswordPage() {
  const [devToken, setDevToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setError(null);
    try {
      const res = await api.post<{ message: string; dev_reset_token: string | null }>(
        '/api/v1/auth/password-reset/request',
        values,
        { skipAuth: true },
      );
      setSent(true);
      setDevToken(res.dev_reset_token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed');
    }
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We'll send a reset link if an account exists">
      {sent ? (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
          <p className="text-[var(--text)]">
            Check your inbox for a password reset link. It expires in 30 minutes.
          </p>
          {devToken && (
            <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-3 text-xs">
              <p className="font-semibold text-[var(--accent-text)]">Development reset token:</p>
              <Link
                to={`/reset-password?token=${encodeURIComponent(devToken)}`}
                className="mt-1 inline-block break-all underline"
              >
                Continue to reset password →
              </Link>
            </div>
          )}
          <Link to="/login" className="block text-xs text-[var(--accent-text)] hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div role="alert" className="text-xs text-[var(--danger)]">
              {error}
            </div>
          )}
          <FormField label="Email" htmlFor="fp-email" error={errors.email?.message}>
            <Input id="fp-email" type="email" placeholder="you@company.com" {...register('email')} />
          </FormField>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Send reset link
          </Button>
          <Link to="/login" className="block text-center text-xs text-[var(--text-muted)]">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}

