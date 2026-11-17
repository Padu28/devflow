import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/lib/api';
import { applyOptimisticBoardMove } from '@/lib/boardMove';
import { renderSafeMarkdown } from '@/lib/markdown';
import { formatActivitySentence, getInitials, isOverdue } from '@/lib/utils';
import type { ActivityEvent, BoardData, TaskCard } from '@/lib/types';
import { useAuthStore } from '@/features/auth/store';
import { computeBackoffMs, RealtimeClient } from '@/features/realtime/client';

describe('markdown safety', () => {
  it('escapes script tags and unsafe javascript: links', () => {
    const html = renderSafeMarkdown(
      '<script>alert(1)</script> [click](javascript:alert(2)) **bold**',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<strong');
  });

  it('renders bullet lists and inline code', () => {
    const html = renderSafeMarkdown('- item `one`\n- item *two*');
    expect(html).toContain('<ul');
    expect(html).toContain('<code');
    expect(html).toContain('<em>two</em>');
  });
});

describe('utils & activity formatter', () => {
  it('computes initials cleanly', () => {
    expect(getInitials('Priya Nair')).toBe('PN');
    expect(getInitials('Demo')).toBe('DE');
    expect(getInitials('')).toBe('?');
  });

  it('detects overdue open tasks only', () => {
    expect(isOverdue('2020-01-01T00:00:00Z', null)).toBe(true);
    expect(isOverdue('2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z')).toBe(false);
    expect(isOverdue(null, null)).toBe(false);
  });

  it('formats activity sentences for moves and comments', () => {
    const base: ActivityEvent = {
      id: '1',
      organization_id: 'org',
      project_id: 'p1',
      actor: { id: 'u1', email: 'p@x.com', display_name: 'Priya', avatar_color: '#38BDF8' },
      entity_type: 'task',
      entity_id: 't1',
      action: 'task.moved',
      metadata: {
        task_key: 'WEB-12',
        task_title: 'Hero',
        from_column: 'To Do',
        to_column: 'Done',
      },
      created_at: '2026-11-16T00:00:00Z',
    };
    expect(formatActivitySentence(base)).toContain('Priya moved WEB-12 "Hero" from To Do -> Done');
    expect(
      formatActivitySentence({ ...base, action: 'comment.created' }),
    ).toContain('Priya commented on WEB-12 "Hero"');
  });
});

describe('applyOptimisticBoardMove', () => {
  const mkTask = (id: string, colId: string, completedAt: string | null = null): TaskCard => ({
    id,
    project_id: 'p1',
    column_id: colId,
    number: 1,
    key: `WEB-${id}`,
    title: `Task ${id}`,
    priority: 'medium',
    due_at: null,
    position: 1024,
    assignee: null,
    labels: [],
    subtask_count: 0,
    subtask_done_count: 0,
    comment_count: 0,
    version: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    completed_at: completedAt,
  });

  const board: BoardData = {
    project: {} as BoardData['project'],
    columns: [
      {
        id: 'c1',
        project_id: 'p1',
        name: 'To Do',
        position: 0,
        color: null,
        wip_limit: null,
        is_done: false,
        tasks: [mkTask('1', 'c1'), mkTask('2', 'c1')],
      },
      {
        id: 'c2',
        project_id: 'p1',
        name: 'Done',
        position: 1,
        color: null,
        wip_limit: null,
        is_done: true,
        tasks: [mkTask('3', 'c2', '2026-11-02T00:00:00Z')],
      },
    ],
  };

  it('moves task across columns and sets completed_at when entering is_done', () => {
    const next = applyOptimisticBoardMove(board, '1', 'c2', 0);
    expect(next.columns[0].tasks.map((t) => t.id)).toEqual(['2']);
    expect(next.columns[1].tasks.map((t) => t.id)).toEqual(['1', '3']);
    expect(next.columns[1].tasks[0].completed_at).not.toBeNull();
    // Original board remains untouched
    expect(board.columns[0].tasks).toHaveLength(2);
  });

  it('clears completed_at when moving out of is_done', () => {
    const next = applyOptimisticBoardMove(board, '3', 'c1', 1);
    expect(next.columns[0].tasks[1].id).toBe('3');
    expect(next.columns[0].tasks[1].completed_at).toBeNull();
  });
});

describe('api client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearSession();
  });

  it('parses contract error shape into ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'stale_update', message: 'Version mismatch', details: null },
          request_id: 'req-123',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(api.patch('/api/v1/projects/p1/tasks/t1', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'stale_update',
      requestId: 'req-123',
    } satisfies Partial<ApiError>);
  });

  it('performs single-flight refresh on 401 and retries request', async () => {
    useAuthStore.getState().setSession('expired-tok', {
      id: 'u1',
      email: 'a@b.com',
      display_name: 'A',
      avatar_color: '#C6F432',
      created_at: '2026-11-01T00:00:00Z',
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) {
        return new Response(
          JSON.stringify({
            access_token: 'fresh-tok',
            token_type: 'bearer',
            expires_in: 900,
            user: useAuthStore.getState().user,
          }),
          { status: 200 },
        );
      }
      const calls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/organizations')).length;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'exp' } }), {
          status: 401,
        });
      }
      return new Response(JSON.stringify([{ id: 'org1' }]), { status: 200 });
    });

    const res = await api.get<{ id: string }[]>('/api/v1/organizations');
    expect(res).toEqual([{ id: 'org1' }]);
    expect(useAuthStore.getState().accessToken).toBe('fresh-tok');
  });
});

describe('RealtimeClient', () => {
  it('computes bounded exponential backoff with jitter', () => {
    expect(computeBackoffMs(0, () => 0)).toBe(1000);
    expect(computeBackoffMs(2, () => 0)).toBe(4000);
    expect(computeBackoffMs(10, () => 0.9)).toBe(30000);
  });

  it('deduplicates events by event_id and skips optimistic echoes', () => {
    class FakeWS {
      static instances: FakeWS[] = [];
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onclose: ((ev: { code: number }) => void) | null = null;
      onerror: (() => void) | null = null;
      sent: string[] = [];
      constructor(public url: string) {
        FakeWS.instances.push(this);
      }
      send(data: string) {
        this.sent.push(data);
      }
      close() {}
    }

    const received: string[] = [];
    const onReconnect = vi.fn();
    const client = new RealtimeClient({
      buildUrl: () => 'ws://localhost/ws',
      currentUserId: () => 'me-1',
      onEvent: (env) => received.push(env.event_id),
      onReconnect,
      WebSocketImpl: FakeWS as unknown as typeof WebSocket,
    });

    client.start();
    const sock = FakeWS.instances[0];
    sock.onopen?.();

    // Duplicate event_id delivered once
    const msg = JSON.stringify({
      event_id: 'ev-1',
      type: 'task.created',
      tenant_id: 'o1',
      actor_id: 'other',
      entity_id: 't1',
      project_id: 'p1',
      timestamp: '2026-11-16T00:00:00Z',
      payload: {},
    });
    sock.onmessage?.({ data: msg });
    sock.onmessage?.({ data: msg });
    expect(received).toEqual(['ev-1']);

    // Echo of own task mutation while optimistic is pending is skipped
    client.markOptimisticStart();
    sock.onmessage?.({
      data: JSON.stringify({
        event_id: 'ev-2',
        type: 'task.moved',
        tenant_id: 'o1',
        actor_id: 'me-1',
        entity_id: 't1',
        project_id: 'p1',
        timestamp: '2026-11-16T00:00:00Z',
        payload: {},
      }),
    });
    expect(received).toEqual(['ev-1']);
    client.markOptimisticEnd();
    client.stop();
  });
});

