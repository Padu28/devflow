import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { Spinner } from '@/components/ui/States';
import { AppShell } from './AppShell';

const LandingPage = lazy(() => import('@/features/landing/LandingPage'));
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'));
const OnboardingPage = lazy(() => import('@/features/organizations/OnboardingPage'));
const InviteAcceptPage = lazy(() => import('@/features/organizations/InviteAcceptPage'));
const DashboardPage = lazy(() => import('@/features/projects/DashboardPage'));
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage'));
const ProjectSettingsPage = lazy(() => import('@/features/projects/ProjectSettingsPage'));
const BoardPage = lazy(() => import('@/features/board/BoardPage'));
const ActivityPage = lazy(() => import('@/features/activity/ActivityPage'));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage'));

const SettingsLayout = lazy(() =>
  import('@/features/settings/SettingsPages').then((m) => ({ default: m.SettingsLayout })),
);
const ProfileSettingsPage = lazy(() =>
  import('@/features/settings/SettingsPages').then((m) => ({ default: m.ProfileSettingsPage })),
);
const SecuritySettingsPage = lazy(() =>
  import('@/features/settings/SettingsPages').then((m) => ({ default: m.SecuritySettingsPage })),
);
const NotificationSettingsPage = lazy(() =>
  import('@/features/settings/SettingsPages').then((m) => ({
    default: m.NotificationSettingsPage,
  })),
);
const WorkspaceSettingsPage = lazy(() =>
  import('@/features/settings/SettingsPages').then((m) => ({ default: m.WorkspaceSettingsPage })),
);
const MembersSettingsPage = lazy(() =>
  import('@/features/settings/SettingsPages').then((m) => ({ default: m.MembersSettingsPage })),
);
const LabelsSettingsPage = lazy(() =>
  import('@/features/settings/SettingsPages').then((m) => ({ default: m.LabelsSettingsPage })),
);

function FullscreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)]">
      <Logo />
      <Spinner />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const location = useLocation();

  if (!bootstrapped) return <FullscreenLoader />;
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6 text-center">
      <p className="font-mono text-xs text-[var(--accent-text)]">404</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Page not found</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        The page you requested does not exist.
      </p>
      <Link to="/" className="mt-5">
        <Button size="sm">Back to home</Button>
      </Link>
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<FullscreenLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/invite/:token" element={<InviteAcceptPage />} />

          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/w/:orgSlug"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<BoardPage />} />
            <Route path="projects/:projectId/settings" element={<ProjectSettingsPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="profile" replace />} />
              <Route path="profile" element={<ProfileSettingsPage />} />
              <Route path="security" element={<SecuritySettingsPage />} />
              <Route path="notifications" element={<NotificationSettingsPage />} />
              <Route path="workspace" element={<WorkspaceSettingsPage />} />
              <Route path="members" element={<MembersSettingsPage />} />
              <Route path="labels" element={<LabelsSettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

