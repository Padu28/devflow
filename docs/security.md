# DevFlow — Security & Threat Model Summary

## Controls Implemented
1. **Multi-tenant isolation**: Every workspace/project/task/comment lookup joins through `memberships` for `current_user.id`. Cross-tenant access returns `404 Not Found` to prevent ID enumeration.
2. **Password hashing**: Argon2id (`argon2-cffi`) with timing-constant dummy verification on unknown-email login attempts.
3. **Token lifecycle**:
   - Short-lived access JWT (15 min, HS256) kept in memory only on the frontend.
   - Opaque refresh token in `httpOnly` cookie (`devflow_refresh`), stored SHA-256 hashed in PostgreSQL.
   - Rotating refresh tokens with family-wide revocation on reuse detection.
4. **Rate limiting**: Sliding window (`10 req/min/IP`) on `/auth/register`, `/auth/login`, and `/auth/password-reset/request` (in-memory or Redis).
5. **Input validation & XSS safety**: Strict Pydantic v2 schemas server-side; Zod validation + HTML-escaped markdown rendering client-side.
6. **Production guard**: Application refuses to start in `ENVIRONMENT=production` with the default `SECRET_KEY`.
7. **Secrets hygiene**: `.env` is gitignored; only `.env.example` placeholders are committed.

## Known Limitations / Out of Scope
- Email delivery for password resets and invitations logs links to stdout in development rather than integrating an SMTP provider (SES/Resend).
- File attachments / S3 virus scanning are not included in MVP.

