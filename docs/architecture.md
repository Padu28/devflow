# DevFlow — System Architecture

## Modular Monolith Rationale
DevFlow is structured as a single deployable FastAPI backend (`app/api/v1`, `services`, `repositories`, `models`, `realtime`, `workers`) backed by PostgreSQL and optional Redis. Avoiding premature microservices eliminates distributed transaction complexity, reduces operational overhead, and keeps cross-domain queries (like board loading and analytics) fast and strongly consistent.

## Component Diagram

```mermaid
flowchart LR
  Browser[React 18 SPA<br/>Motion + dnd-kit + TanStack Query] -->|HTTPS / WSS| Nginx[Nginx Reverse Proxy]
  Nginx -->|/api/v1/*| API[FastAPI Modular Monolith]
  API -->|SQLAlchemy 2| DB[(PostgreSQL 16)]
  API -->|Pub/Sub & Rate Limit| Redis[(Redis 7)]
```

## Auth Token Lifecycle (Rotating Refresh + Reuse Detection)

```mermaid
sequenceDiagram
  participant C as Browser (Memory + Cookie)
  participant A as FastAPI /auth
  participant D as PostgreSQL (refresh_tokens)

  C->>A: POST /auth/login
  A->>D: Store SHA-256(refresh_token) + family_id
  A-->>C: 200 {access_token (15m)} + Set-Cookie devflow_refresh (httpOnly)
  C->>A: POST /auth/refresh (cookie)
  A->>D: Lookup token_hash
  alt Token already revoked (reuse!)
    A->>D: Revoke entire family_id
    A-->>C: 401 Unauthorized
  else Valid token
    A->>D: Mark old revoked, insert new in same family_id
    A-->>C: 200 {new access_token} + rotated cookie
  end
```

## Realtime Fan-out Sequence

```mermaid
sequenceDiagram
  participant U1 as User A (REST)
  participant API as FastAPI Service
  participant DB as PostgreSQL
  participant R as Redis Pub/Sub
  participant U2 as User B (WebSocket)

  U1->>API: POST /projects/{id}/tasks/{tid}/move
  API->>DB: Lock rows, compute midpoint position, commit
  API->>R: Publish envelope to devflow:org:{org_id}
  R-->>API: Deliver to connected workers
  API-->>U2: WS send task.moved (after membership check)
```

## Task Ordering & Optimistic Concurrency
- **Fractional midpoint positions**: Each task has a `float` `position`. Moving a task to index `i` locks the task and destination column siblings (`with_for_update()`), computes the midpoint between neighbors (or `±1024.0` at ends), and rebalances the column at `1024.0` intervals only if the gap drops below `1e-6`.
- **Optimistic concurrency**: `PATCH /tasks/{id}` requires `version`. A mismatch returns `409 stale_update`, and the frontend refetches the latest task state.
- **Optimistic UI**: `BoardPage` snapshots the TanStack Query cache in `onMutate`, applies `applyOptimisticBoardMove`, and rolls back cleanly in `onError`.

## Failure Modes & Next Improvements
- **WebSocket disconnect**: Client uses exponential backoff with jitter (`1s → 30s`), polls every `30s` while disconnected, and invalidates queries upon reconnect.
- **Next steps**: Offload email/digest notifications to Celery + Redis workers (`app/workers/reminders.py`), add S3 presigned URLs for file attachments, and add read replicas if analytics queries grow.

