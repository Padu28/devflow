# ADR-0002: PostgreSQL + SQLAlchemy 2 + Alembic

## Context
Multi-tenant task management requires strong relational integrity, foreign keys, check constraints, composite indexes, and transactional row locking (`SELECT ... FOR UPDATE`).

## Decision
Use PostgreSQL 16 as the primary database, SQLAlchemy 2.0 typed `Mapped[]` models with explicit constraint naming conventions, and Alembic for versioned migrations.

## Consequences
- Schema changes are reproducible and tested in CI against PostgreSQL 16.
- Analytics aggregates and board queries execute in constant SQL query counts without N+1 round-trips.

