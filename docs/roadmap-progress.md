# DevFlow — Roadmap Progress Tracker

| Milestone / Gate | Status | Location in Repo |
|---|---|---|
| Week 1: Problem statement, personas, user flows, wireframes, permission matrix | ✅ Done | [docs/product/](product/problem-statement.md) |
| Week 2: FastAPI, settings, SQLAlchemy 2, Alembic, PostgreSQL/SQLite, logging, CORS, `/health` | ✅ Done | `backend/app/core/`, `backend/app/db/`, `backend/alembic/` |
| Week 3: Auth (Argon2id, JWT, rotating refresh, reset), tenancy, invitations, cross-tenant tests | ✅ Done | `backend/app/services/auth_service.py`, `org_service.py`, `tests/` |
| Week 4: Projects, columns, fractional task ordering, concurrency `version`, subtasks, comments | ✅ Done | `backend/app/services/project_service.py`, `task_service.py` |
| Week 5: React + Vite + TS shell, routing, typed API client, sidebar, workspace switcher, `⌘K` | ✅ Done | `frontend/src/app/`, `frontend/src/lib/api.ts`, `CommandPalette.tsx` |
| Week 6: Kanban board (`dnd-kit`), optimistic move + rollback, drawer, keyboard alternatives | ✅ Done | `frontend/src/features/board/`, `frontend/src/features/tasks/` |
| Week 7: Authenticated WebSockets, event envelope, presence, reconnect backoff, notifications | ✅ Done | `backend/app/realtime/`, `frontend/src/features/realtime/` |
| Week 8: Analytics SQL aggregates + Recharts, Vitest (15 tests), Playwright specs | ✅ Done | `frontend/src/features/analytics/`, `frontend/src/tests/`, `frontend/e2e/` |
| Week 9: Dockerfiles, Nginx, Docker Compose, GitHub Actions CI, rate limits | ✅ Done | `docker-compose.yml`, `infra/nginx/`, `.github/workflows/ci.yml` |
| Week 10: Run `pytest` locally/CI, run `scripts/benchmark.py`, cloud deploy, record demo video | ⏳ User action | `docs/deployment.md`, `docs/performance.md`, `docs/resume.md` |

