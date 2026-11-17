# DevFlow — Resume Bullets & Interview Prep

> Formula: *Built [system] using [stack] to solve [problem]; implemented [specific engineering feature]; measured [verified result] under [test conditions].*
> Fill `[measured: …]` placeholders only after running `scripts/benchmark.py` and `pytest --cov`.

## Resume Bullets
- **Built DevFlow**, a multi-tenant project management and real-time collaboration platform using **FastAPI, SQLAlchemy 2, PostgreSQL, React 18, TypeScript, and WebSockets** to support role-based team Kanban workflows.
- **Implemented strict tenant isolation and rotating refresh-token authentication** (Argon2id, in-memory JWTs, httpOnly SHA-256 refresh cookies with reuse-family revocation), verified by automated cross-tenant 404 isolation tests across all resource endpoints.
- **Engineered transactional fractional-position Kanban ordering** (`SELECT ... FOR UPDATE` row locks + automatic column rebalancing) and **optimistic UI updates with rollback**, backed by a constant-query board loader (`[measured: X SQL queries regardless of task count]`).
- **Delivered real-time workspace sync** via authenticated WebSockets with optional Redis Pub/Sub fan-out, exponential-backoff reconnection, and LRU event deduplication; achieved `[measured: p50/p95 ms]` board load latency under `[N]` concurrent requests.

## Interview Talking Points
1. **Difficult bug / race condition**: Concurrent drag-and-drop moves into the same column can collide on fractional positions or corrupt order; solved with `with_for_update()` row locks on the moved task and destination column siblings plus automatic `1024.0` rebalancing when gaps drop below `1e-6`.
2. **Key architectural trade-off**: Chose a **modular monolith** over microservices so task mutations, immutable `activity_events`, and `notifications` commit in a single ACID transaction, while keeping `realtime` and `workers` decoupled enough to extract later.
3. **Security control**: Refresh-token rotation with `family_id` reuse detection—if a stolen refresh token is replayed after rotation, the entire token family is immediately revoked.
4. **Performance improvement**: Eliminated N+1 queries on `GET /projects/{id}/board` using `selectinload` + grouped SQL subqueries for subtask/comment counts, and split `recharts`/`dnd-kit` out of the landing chunk (`26.69 kB` raw / `8.57 kB` gzip).

## 60–90 Second Demo Video Script
- **0:00–0:12**: Landing page (`/`) — show kinetic flow-field hero, tilted live Kanban preview, click **Try Live Demo**.
- **0:12–0:28**: Workspace Dashboard & Projects — show KPI count-ups, switch/open **Website Relaunch (WEB)**.
- **0:28–0:50**: Kanban Board — drag a card across columns (or use `Alt+→` / `…` Move menu), show instant optimistic update, filter by priority, open Task Drawer, toggle a subtask, post a comment.
- **0:50–1:10**: Realtime & Notifications — show notification bell / activity feed and Analytics tab (completion trend, status breakdown, member workload).
- **1:10–1:25**: Briefly show `GET /docs` OpenAPI and Docker/CI setup.

