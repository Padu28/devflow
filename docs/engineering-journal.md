# DevFlow — Engineering Journal

## 2026-11-16 — Contract-First & Tenant Boundary
- **Decision**: Authored `docs/api-contract.md` and `docs/design-system.md` before writing application code so frontend and backend share exact types, error shapes, and permission rules.
- **Security**: Non-members querying any org/project/task/comment receive `404 Not Found` (not `403`) to avoid leaking whether a UUID exists in another tenant.
- **IDs**: Used UUIDv4 primary keys everywhere to prevent sequential ID enumeration.

## 2026-11-16 — Constant-Query Board Loader
- **Problem**: Naive ORM relationship loading on Kanban boards causes N+1 queries for assignees, labels, subtask counts, and comment counts.
- **Solution**: `task_service.get_board` uses `selectinload` for `assignee` and `labels` plus two `GROUP BY` aggregate queries for subtask and comment counts. Added `test_board_constant_query_count` to fail CI if query count grows with task count.

## 2026-11-16 — Bundle Splitting for Landing Page
- **Observation**: `recharts` (~424 kB) and `@dnd-kit` (~50 kB) are heavy dependencies needed only inside authenticated workspace routes.
- **Solution**: Configured React `lazy()` route splitting + Vite `manualChunks`. Verified `LandingPage` chunk builds at `26.69 kB` (`8.57 kB` gzipped), completely isolated from charts and DnD.

