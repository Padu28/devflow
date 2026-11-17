from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import RateLimitError


class SlidingWindowRateLimiter:
    """Thread-safe in-memory sliding-window rate limiter with optional Redis backend."""

    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()
        self._redis_client: object | None = None

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()

    def check(self, key: str, max_requests: int = 10, window_seconds: int = 60) -> None:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return

        if settings.redis_url and self._check_redis(
            key, max_requests, window_seconds, settings.redis_url
        ):
            return

        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            q = self._buckets[key]
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= max_requests:
                retry_after = max(1, int(window_seconds - (now - q[0])))
                raise RateLimitError(retry_after=retry_after)
            q.append(now)

    def _check_redis(
        self, key: str, max_requests: int, window_seconds: int, redis_url: str
    ) -> bool:
        try:
            import redis

            if self._redis_client is None:
                self._redis_client = redis.from_url(redis_url, decode_responses=True)
            client = self._redis_client
            assert isinstance(client, redis.Redis)
            now_ms = int(time.time() * 1000)
            window_ms = window_seconds * 1000
            rkey = f"devflow:rl:{key}"
            pipe = client.pipeline()
            pipe.zremrangebyscore(rkey, 0, now_ms - window_ms)
            pipe.zadd(rkey, {f"{now_ms}-{id(pipe)}": now_ms})
            pipe.zcard(rkey)
            pipe.expire(rkey, window_seconds + 1)
            results = pipe.execute()
            count = int(results[2])
            if count > max_requests:
                raise RateLimitError(retry_after=window_seconds)
            return True
        except RateLimitError:
            raise
        except Exception:
            return False


rate_limiter = SlidingWindowRateLimiter()


def limit_auth_requests(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"auth:{client_ip}:{request.url.path}", max_requests=10, window_seconds=60)
