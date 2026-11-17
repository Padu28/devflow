# DevFlow — Deployment Guide

## Option 1: Docker Compose (Single Host / VM)
1. Copy `.env.example` to `.env` and set strong `POSTGRES_PASSWORD` and `SECRET_KEY` (≥ 32 chars).
2. Run:
   ```bash
   docker compose up --build -d
   ```
3. App is served on `http://localhost:8080` (Nginx proxies `/api/*` including WebSockets to FastAPI `:8000`).

## Option 2: Split Cloud Hosting (Render/Railway + Managed Postgres + Netlify/Vercel)
1. **PostgreSQL**: Provision a managed Postgres 16 database (Neon, Supabase, or Render Postgres).
2. **Backend (Render / Railway / Fly.io)**:
   - Root directory: `backend`
   - Build command: `pip install -r requirements.txt`
   - Start command: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Env vars: `ENVIRONMENT=production`, `DATABASE_URL`, `SECRET_KEY` (32+ random chars), `CORS_ORIGINS=https://your-frontend.netlify.app`, `FRONTEND_URL=https://your-frontend.netlify.app`, optional `REDIS_URL`.
3. **Frontend (Netlify / Vercel)**:
   - Root directory: `frontend`
   - Build command: `npm ci && npm run build`
   - Publish directory: `dist`
   - Env var: `VITE_API_URL=https://your-api.onrender.com`
   - Note: For cross-site refresh cookies in production over HTTPS, ensure `SameSite=None; Secure` if frontend and API are on different root domains, or proxy `/api/*` through a single domain.

## AWS Notes
If deploying to AWS (ECS/Fargate + RDS), set **AWS Budgets** billing alerts before provisioning resources.

## Post-Deploy Smoke Test Checklist
- [ ] `GET /health` returns `200 {"status":"ok"}`
- [ ] `GET /ready` returns `200 {"status":"ready","database":"ok"}`
- [ ] HTTPS active; HTTP redirects to HTTPS
- [ ] Demo login (`demo@devflow.dev` / `DemoPass123!`) works and WebSocket connects (`wss://`)

