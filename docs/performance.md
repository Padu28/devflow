# DevFlow — Performance & Measurement Guide

## What We Measure
Per the engineering roadmap:
1. **p50 / p95 / p99 API latency** under a documented load test (`scripts/benchmark.py` and `loadtest/locustfile.py`).
2. **SQL query count** for `GET /api/v1/projects/{id}/board` as task count scales (automated assertion in `tests/test_tasks_and_board.py`).
3. **WebSocket reconnect** behavior and fallback polling.
4. **Playwright critical-path pass rate** and **authorization test coverage**.
5. **Frontend bundle sizes** (`vite build`).

## How to Run Benchmarks Locally

### 1. Quick Async HTTP Benchmark
Start the backend (`uvicorn app.main:app --port 8000`) with seeded data (`python -m app.scripts.seed`), then run:
```bash
cd devflow
backend/.venv/Scripts/python.exe scripts/benchmark.py --requests 300 --concurrency 10 --output docs/benchmarks/latest.md
```

### 2. Locust Load Test
```bash
locust -f loadtest/locustfile.py --host http://localhost:8000
```

## Results

### Frontend Production Build (Verified via `npm run build`)
- `LandingPage` chunk: `26.69 kB` (`8.57 kB` gzipped) — isolated from charts and DnD
- `BoardPage` chunk: `35.45 kB` (`10.02 kB` gzipped)
- `vendor-react`: `157.18 kB` (`51.48 kB` gzipped)
- `vendor-motion`: `103.94 kB` (`34.71 kB` gzipped)
- `vendor-dnd`: `49.81 kB` (`16.55 kB` gzipped)
- `vendor-charts`: `424.39 kB` (`114.15 kB` gzipped) — lazy-loaded on Analytics only

### API Latency & DB EXPLAIN ANALYZE
> **TBD — filled from real runs**: Run `scripts/benchmark.py` against your local or deployed PostgreSQL instance and paste the generated table here. Never fabricate numbers.

