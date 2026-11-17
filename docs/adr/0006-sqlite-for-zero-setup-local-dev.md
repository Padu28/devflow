# ADR-0006: SQLite Zero-Setup Local Dev with PostgreSQL Parity

## Context
A reviewer or new developer cloning the repository should be able to boot the app in under a minute without installing Postgres locally, while production and CI run on PostgreSQL 16.

## Decision
Default `DATABASE_URL` to `sqlite:///./devflow.db` with `PRAGMA foreign_keys=ON` and Alembic `render_as_batch=True`. Write all queries using portable SQLAlchemy 2 expressions and run CI integration tests against PostgreSQL 16.

## Consequences
- `START.bat` and `uvicorn` work immediately out of the box.
- Production parity is enforced by running `alembic upgrade head` and `pytest` against PostgreSQL in GitHub Actions.

