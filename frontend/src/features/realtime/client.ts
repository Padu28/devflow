import type { RealtimeEnvelope } from '@/lib/types';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface RealtimeClientOptions {
  buildUrl: () => string | null;
  currentUserId: () => string | null;
  onEvent: (envelope: RealtimeEnvelope) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  onReconnect?: () => void;
  onPollFallback?: () => void;
  WebSocketImpl?: typeof WebSocket;
  pingIntervalMs?: number;
  pollIntervalMs?: number;
}

export function computeBackoffMs(attempt: number, rng: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
  const jitter = Math.floor(rng() * 500);
  return Math.min(30_000, base + jitter);
}

export class RealtimeClient {
  private opts: RealtimeClientOptions;
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private attempt = 0;
  private hasConnectedOnce = false;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private seenIds: string[] = [];
  private seenSet = new Set<string>();
  private pendingMutations = 0;

  constructor(opts: RealtimeClientOptions) {
    this.opts = opts;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  markOptimisticStart(): void {
    this.pendingMutations += 1;
  }

  markOptimisticEnd(): void {
    this.pendingMutations = Math.max(0, this.pendingMutations - 1);
  }

  sendPresenceView(projectId: string | null): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'presence.view', project_id: projectId }));
    }
  }

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.opts.onStatusChange?.(next);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private startPollFallback(): void {
    if (this.pollTimer || !this.opts.onPollFallback) return;
    const ms = this.opts.pollIntervalMs ?? 30_000;
    this.pollTimer = setInterval(() => {
      if (this.status !== 'connected') {
        this.opts.onPollFallback?.();
      }
    }, ms);
  }

  private recordEventId(id: string): boolean {
    if (this.seenSet.has(id)) return false;
    this.seenSet.add(id);
    this.seenIds.push(id);
    if (this.seenIds.length > 500) {
      const oldest = this.seenIds.shift();
      if (oldest) this.seenSet.delete(oldest);
    }
    return true;
  }

  private connect(): void {
    if (this.stopped) return;
    const url = this.opts.buildUrl();
    if (!url) {
      this.setStatus('disconnected');
      return;
    }

    const WS = this.opts.WebSocketImpl ?? WebSocket;
    this.setStatus('connecting');
    const socket = new WS(url);
    this.ws = socket;

    socket.onopen = () => {
      if (this.stopped) return;
      const isReconnect = this.hasConnectedOnce;
      this.hasConnectedOnce = true;
      this.attempt = 0;
      this.setStatus('connected');
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      const pingMs = this.opts.pingIntervalMs ?? 25_000;
      this.pingTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === 1) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, pingMs);
      if (isReconnect) {
        this.opts.onReconnect?.();
      }
    };

    socket.onmessage = (ev) => {
      try {
        const envelope = JSON.parse(String(ev.data)) as RealtimeEnvelope;
        if (!envelope || !envelope.event_id) return;
        if (!this.recordEventId(envelope.event_id)) return;
        if (envelope.type === 'pong') return;

        // Skip echo of our own mutation while an optimistic update is in flight
        const me = this.opts.currentUserId();
        if (
          me &&
          envelope.actor_id === me &&
          this.pendingMutations > 0 &&
          envelope.type.startsWith('task.')
        ) {
          return;
        }
        this.opts.onEvent(envelope);
      } catch {
        // Ignore malformed frame
      }
    };

    socket.onclose = (ev) => {
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      this.ws = null;
      this.setStatus('disconnected');
      if (this.stopped) return;
      // 4401 / 4403 = auth or membership failure; do not spin reconnect
      if (ev.code === 4401 || ev.code === 4403) {
        return;
      }
      this.startPollFallback();
      const delay = computeBackoffMs(this.attempt);
      this.attempt += 1;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };

    socket.onerror = () => {
      // onclose handles reconnect
    };
  }
}

