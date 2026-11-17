import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { refreshAccessToken } from '@/lib/api';
import { useReducedMotionPref } from '@/lib/hooks';
import { useAuthStore } from '@/features/auth/store';
import { TooltipProvider } from '@/components/ui/Overlays';
import { ErrorBoundary } from '@/components/ui/States';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotionPref();
  const theme = useAuthStore((s) => s.theme);
  const setBootstrapped = useAuthStore((s) => s.setBootstrapped);

  useEffect(() => {
    refreshAccessToken().finally(() => setBootstrapped(true));
  }, [setBootstrapped]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
          <TooltipProvider>
            {children}
            <Toaster theme={theme} position="bottom-right" richColors closeButton />
          </TooltipProvider>
        </MotionConfig>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

