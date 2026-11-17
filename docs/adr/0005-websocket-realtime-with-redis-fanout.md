# ADR-0005: WebSocket Realtime with Optional Redis Pub/Sub Fan-out

## Context
Users on the same Kanban board need live updates when teammates move tasks, post comments, or join/leave.

## Decision
Implement an authenticated WebSocket endpoint (`WS /api/v1/ws/organizations/{org_id}?token=`) backed by an in-process `ConnectionManager`. When `REDIS_URL` is configured, events publish to Redis channel `devflow:org:{org_id}` so multiple API workers stay synchronized. Membership is verified on connect and re-checked periodically on delivery.

## Consequences
- Zero external broker required for local SQLite/single-process dev.
- Horizontal scaling works out of the box when Redis is enabled in Docker/production.
- Client handles exponential backoff, `event_id` LRU deduplication, and 30s polling fallback.

