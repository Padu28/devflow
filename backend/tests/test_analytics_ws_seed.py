from __future__ import annotations

import pytest
from app.scripts.seed import seed_demo_data
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from tests.conftest import auth_headers, register_and_login


def test_analytics_overview_and_search(client: TestClient) -> None:
    token, user = register_and_login(client, "ana@example.com", display_name="Analyst")
    org = client.post(
        "/api/v1/organizations", json={"name": "AnaOrg"}, headers=auth_headers(token)
    ).json()
    proj = client.post(
        f"/api/v1/organizations/{org['id']}/projects",
        json={"name": "SearchProj", "key": "SRC"},
        headers=auth_headers(token),
    ).json()

    done_col = next(c for c in proj["columns"] if c["is_done"])
    client.post(
        f"/api/v1/projects/{proj['id']}/tasks",
        json={"title": "Open High Task", "priority": "high", "assignee_id": user["id"]},
        headers=auth_headers(token),
    )
    client.post(
        f"/api/v1/projects/{proj['id']}/tasks",
        json={"title": "Finished Task", "column_id": done_col["id"], "priority": "low"},
        headers=auth_headers(token),
    )

    ana = client.get(
        f"/api/v1/organizations/{org['id']}/analytics/overview?days=7",
        headers=auth_headers(token),
    )
    assert ana.status_code == 200
    data = ana.json()
    assert data["totals"]["tasks"] == 2
    assert data["totals"]["open"] == 1
    assert data["totals"]["completed"] == 1
    assert len(data["completion_trend"]) == 7

    srch = client.get(
        f"/api/v1/organizations/{org['id']}/search?q=SRC-1",
        headers=auth_headers(token),
    )
    assert srch.status_code == 200
    assert len(srch.json()["tasks"]) == 1
    assert srch.json()["tasks"][0]["key"] == "SRC-1"


def test_websocket_auth_and_realtime_events(client: TestClient) -> None:
    t1, _ = register_and_login(client, "ws1@example.com", display_name="WS One")
    t2, _ = register_and_login(client, "ws2@example.com", display_name="WS Two")
    org = client.post(
        "/api/v1/organizations", json={"name": "WSOrg"}, headers=auth_headers(t1)
    ).json()
    proj = client.post(
        f"/api/v1/organizations/{org['id']}/projects",
        json={"name": "RealtimeProj"},
        headers=auth_headers(t1),
    ).json()

    # Bad token -> 4401
    with pytest.raises(WebSocketDisconnect) as exc_bad:
        with client.websocket_connect(f"/api/v1/ws/organizations/{org['id']}?token=invalid"):
            pass
    assert exc_bad.value.code == 4401

    # Non-member -> 4403
    with pytest.raises(WebSocketDisconnect) as exc_non:
        with client.websocket_connect(f"/api/v1/ws/organizations/{org['id']}?token={t2}"):
            pass
    assert exc_non.value.code == 4403

    # Valid member connects, receives hello + presence.state, and receives task.created
    with client.websocket_connect(f"/api/v1/ws/organizations/{org['id']}?token={t1}") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        pres = ws.receive_json()
        assert pres["type"] == "presence.state"
        assert len(pres["payload"]["users"]) == 1

        ws.send_json({"type": "ping"})
        pong = ws.receive_json()
        assert pong["type"] == "pong"

        created = client.post(
            f"/api/v1/projects/{proj['id']}/tasks",
            json={"title": "Live Task"},
            headers=auth_headers(t1),
        )
        assert created.status_code == 201
        ev = ws.receive_json()
        assert ev["type"] == "task.created"
        assert ev["payload"]["task"]["title"] == "Live Task"


def test_seed_script_idempotent(db_session, monkeypatch) -> None:
    from app.scripts import seed as seed_mod
    from sqlalchemy.orm import sessionmaker

    TestSession = sessionmaker(
        bind=db_session.get_bind(), autoflush=False, autocommit=False, expire_on_commit=False
    )
    monkeypatch.setattr(seed_mod, "SessionLocal", TestSession)
    assert seed_demo_data() is True
    assert seed_demo_data() is False
