import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from '@/features/auth/LoginPage';
import { TaskCardVisual } from '@/features/board/TaskCardItem';
import { PriorityBadge } from '@/components/ui/Badge';
import type { TaskCard } from '@/lib/types';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  it('shows inline validation errors on blank submit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument();
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
  });

  it('displays server error alert when credentials fail', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'unauthorized', message: 'Invalid email or password', details: null },
          request_id: 'r1',
        }),
        { status: 401 },
      ),
    );

    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText(/email/i), 'bad@devflow.dev');
    await user.type(screen.getByLabelText(/password/i), 'WrongPass1');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });
    vi.restoreAllMocks();
  });
});

describe('TaskCardVisual & PriorityBadge', () => {
  const sampleTask: TaskCard = {
    id: 't1',
    project_id: 'p1',
    column_id: 'c1',
    number: 12,
    key: 'WEB-12',
    title: 'Ship kinetic hero canvas',
    priority: 'urgent',
    due_at: '2020-01-01T00:00:00Z',
    position: 1024,
    assignee: {
      id: 'u1',
      email: 'priya@devflow.dev',
      display_name: 'Priya Nair',
      avatar_color: '#38BDF8',
    },
    labels: [{ id: 'l1', name: 'Design', color: '#A78BFA' }],
    subtask_count: 3,
    subtask_done_count: 2,
    comment_count: 4,
    version: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    completed_at: null,
  };

  it('renders task key, title, labels, subtask progress, and accessible priority', () => {
    render(<TaskCardVisual task={sampleTask} />);
    expect(screen.getByText('WEB-12')).toBeInTheDocument();
    expect(screen.getByText('Ship kinetic hero canvas')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority: Urgent')).toBeInTheDocument();
  });

  it('renders PriorityBadge with label', () => {
    render(<PriorityBadge priority="high" />);
    expect(screen.getByLabelText('Priority: High')).toHaveTextContent('High');
  });
});

