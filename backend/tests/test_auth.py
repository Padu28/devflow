from __future__ import annotations

from app.core.config import get_settings
from app.core.rate_limit import rate_limiter
from fastapi.testclient import TestClient
from tests.conftest import auth_headers, register_and_login


def test_register_login_me_and_logout(client: TestClient) -> None:
    token, user = register_and_login(client, "alice@example.com", "Secret123", "Alice")
    assert user["email"] == "alice@example.com"

    me = client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert me.status_code == 200
    assert me.json()["display_name"] == "Alice"

    # Duplicate email returns 409
    dup = client.post(
        "/api/v1/auth/register",
        json={"email": "ALICE@example.com", "password": "Secret123", "display_name": "Alice2"},
    )
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "conflict"

    # Bad password returns 401
    bad = client.post(
        "/api/v1/auth/login",
        json={"email": "alice@example.com", "password": "WrongPassword1"},
    )
    assert bad.status_code == 401

    # Logout clears cookie and revokes family
    out = client.post("/api/v1/auth/logout")
    assert out.status_code == 204
    ref_after = client.post("/api/v1/auth/refresh")
    assert ref_after.status_code == 401


def test_refresh_rotation_and_reuse_detection(client: TestClient) -> None:
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "bob@example.com", "password": "Password1", "display_name": "Bob"},
    )
    assert res.status_code == 201
    first_cookie = client.cookies.get("devflow_refresh")
    assert first_cookie

    # Normal rotation succeeds and issues a new cookie
    r1 = client.post("/api/v1/auth/refresh")
    assert r1.status_code == 200
    second_cookie = client.cookies.get("devflow_refresh")
    assert second_cookie and second_cookie != first_cookie

    # Reusing the OLD (revoked) cookie must fail with 401 AND revoke the whole token family
    client.cookies.set("devflow_refresh", first_cookie)
    reuse = client.post("/api/v1/auth/refresh")
    assert reuse.status_code == 401

    # Now even the newer cookie from the same family must be rejected!
    client.cookies.set("devflow_refresh", second_cookie)
    after_theft = client.post("/api/v1/auth/refresh")
    assert after_theft.status_code == 401


def test_password_reset_flow(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "development")
    get_settings.cache_clear()

    register_and_login(client, "carol@example.com", "OldPass123", "Carol")

    req = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "carol@example.com"},
    )
    assert req.status_code == 202
    token = req.json()["dev_reset_token"]
    assert token

    conf = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "NewPass456"},
    )
    assert conf.status_code == 204

    # Old password fails, new password works
    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": "carol@example.com", "password": "OldPass123"},
    )
    assert old_login.status_code == 401
    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": "carol@example.com", "password": "NewPass456"},
    )
    assert new_login.status_code == 200


def test_auth_rate_limit_429(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
    get_settings.cache_clear()
    rate_limiter.reset()

    for _ in range(10):
        res = client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@example.com", "password": "Password1"},
        )
        assert res.status_code == 401

    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "Password1"},
    )
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"
    assert "Retry-After" in blocked.headers
