# ADR-0001: Modular Monolith Backend

## Context
Splitting a brand-new SaaS workspace into separate auth, project, task, and notification microservices adds network hops, distributed transactions, and deployment overhead before product-market fit or scale bottlenecks exist.

## Decision
Build a single deployable FastAPI modular monolith with strict internal boundaries (`api/v1` → `services` → `repositories` → `models`), plus `realtime` and `workers` modules.

## Consequences
- Atomic SQL transactions across tasks, activity events, and notifications.
- Single CI pipeline and single Docker image for the API.
- Clear module seams allow extracting `realtime` or `workers` later if needed.

