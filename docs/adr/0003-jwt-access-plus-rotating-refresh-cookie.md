# ADR-0003: In-Memory Access JWT + Rotating httpOnly Refresh Cookie

## Context
Storing long-lived JWTs in `localStorage` exposes them to XSS. Pure server sessions complicate stateless API auth.

## Decision
Issue short-lived (15 min) HS256 access tokens held in memory only (`zustand`), paired with an opaque `httpOnly`, `SameSite=Lax` refresh cookie (`devflow_refresh`) stored SHA-256 hashed with a `family_id` in `refresh_tokens`. Every refresh rotates the token; reuse of a revoked token revokes the entire family.

## Consequences
- XSS cannot exfiltrate refresh tokens.
- Stolen refresh tokens are detected on next use and invalidated across the session family.
- Frontend boots with a single-flight `POST /api/v1/auth/refresh` call.

