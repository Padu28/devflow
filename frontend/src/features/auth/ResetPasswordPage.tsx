import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/Input';
import { AuthLayout } from './AuthLayout';

const schema = z.object({
  token: z.string().min(10, 'Reset token is required'),
  new_password: z
    .string()
    .min(8, 'Must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Must include a letter')
    .regex(/\d/, 'Must include a digit'),
});

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { token: params.get('token') ?? '', new_password: '' },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setError(null);
    try {
      await api.post('/api/v1/auth/password-reset/confirm', values, { skipAuth: true });
      toast.success('Password updated. Please sign in.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reset password');
    }
  };

  return (
    <AuthLayout title="Choose a new password" subtitle="Enter your new account password below">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]"
          >
            {error}
          </div>
        )}
        <FormField label="Reset token" htmlFor="rp-token" error={errors.token?.message}>
          <Input id="rp-token" {...register('token')} />
        </FormField>
        <FormField label="New password" htmlFor="rp-pass" error={errors.new_password?.message}>
          <Input id="rp-pass" type="password" {...register('new_password')} />
        </FormField>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
        <Link to="/login" className="block text-center text-xs text-[var(--text-muted)]">
          Back to sign in
        </Link>
      </form>
    </AuthLayout>
  );
}

