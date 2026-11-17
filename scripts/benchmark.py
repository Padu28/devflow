"""Lightweight async HTTP benchmark for DevFlow endpoints using httpx + asyncio."""

from __future__ import annotations

import argparse
import asyncio
import math
import platform
import statistics
import time
from pathlib import Path

import httpx


def percentile(sorted_vals: list[float], pct: float) -> float:
    if not sorted_vals:
        return 0.0
    idx = (len(sorted_vals) - 1) * (pct / 100.0)
    lo = math.floor(idx)
    hi = math.ceil(idx)
    if lo == hi:
        return sorted_vals[lo]
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (idx - lo)


async def run_benchmark(base_url: str, total_requests: int, concurrency: int, output: str | None) -> None:
    async with httpx.AsyncClient(base_url=base_url, timeout=15.0) as client:
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": "demo@devflow.dev", "password": "DemoPass123!"},
        )
        login.raise_for_status()
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        orgs = (await client.get("/api/v1/organizations", headers=headers)).json()
        org_id = orgs[0]["id"]
        projs = (
            await client.get(f"/api/v1/organizations/{org_id}/projects", headers=headers)
        ).json()
        project_id = projs["items"][0]["id"]

        targets = [
            ("GET /auth/me", "/api/v1/auth/me"),
            ("GET /projects/{id}/board", f"/api/v1/projects/{project_id}/board"),
            ("GET /projects/{id}/tasks", f"/api/v1/projects/{project_id}/tasks"),
            ("GET /organizations/{id}/search", f"/api/v1/organizations/{org_id}/search?q=api"),
            (
                "GET /organizations/{id}/analytics/overview",
                f"/api/v1/organizations/{org_id}/analytics/overview?days=30",
            ),
        ]

        # Warmup
        for _, path in targets:
            await client.get(path, headers=headers)

        lines = [
            f"# Benchmark Report",
            "",
            f"- Base URL: `{base_url}`",
            f"- Python: `{platform.python_version()}` on `{platform.system()} {platform.release()}`",
            f"- Requests per endpoint: `{total_requests}` · Concurrency: `{concurrency}`",
            "",
            "| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) | Mean (ms) | RPS | Errors |",
            "|---|---:|---:|---:|---:|---:|---:|",
        ]

        sem = asyncio.Semaphore(concurrency)
        for label, path in targets:
            latencies: list[float] = []
            errors = 0

            async def _one(p: str = path) -> None:
                nonlocal errors
                async with sem:
                    t0 = time.perf_counter()
                    try:
                        r = await client.get(p, headers=headers)
                        if r.status_code >= 400:
                            errors += 1
                    except Exception:
                        errors += 1
                    latencies.append((time.perf_counter() - t0) * 1000.0)

            started = time.perf_counter()
            await asyncio.gather(*[_one() for _ in range(total_requests)])
            elapsed = max(0.001, time.perf_counter() - started)
            latencies.sort()

            lines.append(
                f"| `{label}` | {percentile(latencies, 50):.2f} | "
                f"{percentile(latencies, 95):.2f} | {percentile(latencies, 99):.2f} | "
                f"{statistics.mean(latencies):.2f} | {total_requests / elapsed:.1f} | {errors} |"
            )

        report = "\n".join(lines) + "\n"
        print(report)
        if output:
            out_path = Path(output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(report, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark DevFlow REST endpoints")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--requests", type=int, default=300)
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--output", default=None)
    args = parser.parse_args()
    asyncio.run(run_benchmark(args.base_url, args.requests, args.concurrency, args.output))


if __name__ == "__main__":
    main()

