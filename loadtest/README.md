# Load Testing with Locust

1. Ensure the backend is running and seeded (`python -m app.scripts.seed`).
2. Install Locust in a separate environment or `pip install locust`.
3. Run:
   ```bash
   locust -f loadtest/locustfile.py --host http://localhost:8000
   ```
4. Open `http://localhost:8089`, start with 10 users / spawn rate 2, and record p50/p95 latencies in `docs/performance.md`.

