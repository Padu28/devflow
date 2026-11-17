# Contributing to DevFlow

## Workflow
1. Create a small branch from `main` (e.g., `feat/board-saved-views`, `fix/ws-reconnect`).
2. Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
3. Keep `docs/api-contract.md` in sync before modifying API routes or schemas.
4. Run checks before opening a PR:
   - Backend: `ruff check .`, `mypy app`, `pytest`
   - Frontend: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`

