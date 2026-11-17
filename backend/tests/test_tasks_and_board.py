from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import event
from tests.conftest import auth_headers, register_and_login


def _create_org_and_project(client: TestClient, token: str):
    org = client.post(
        "/api/v1/organizations", json={"name": "BuildOrg"}, headers=auth_headers(token)
    ).json()
    proj = client.post(
        f"/api/v1/organizations/{org['id']}/projects",
        json={"name": "Backend", "key": "BE"},
        headers=auth_headers(token),
    ).json()
    return org, proj


def test_task_crud_optimistic_concurrency_and_explicit_null(client: TestClient) -> None:
    token, user = register_and_login(client, "dev@example.com", display_name="Dev")
    _, proj = _create_org_and_project(client, token)

    created = client.post(
        f"/api/v1/projects/{proj['id']}/tasks",
        json={
            "title": "Build API",
            "priority": "high",
            "due_at": "2026-12-01T12:00:00Z",
            "assignee_id": user["id"],
        },
        headers=auth_headers(token),
    )
    assert created.status_code == 201
    t = created.json()
    assert t["key"] == "BE-1"
    assert t["version"] == 1
    assert t["assignee"]["id"] == user["id"]

    # Stale version returns 409 stale_update
    stale = client.patch(
        f"/api/v1/projects/{proj['id']}/tasks/{t['id']}",
        json={"version": 99, "title": "Stale"},
        headers=auth_headers(token),
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "stale_update"

    # Explicit null clears due_at and assignee_id while omitted fields stay intact
    patched = client.patch(
        f"/api/v1/projects/{proj['id']}/tasks/{t['id']}",
        json={"version": 1, "due_at": None, "assignee_id": None},
        headers=auth_headers(token),
    )
    assert patched.status_code == 200
    p_data = patched.json()
    assert p_data["version"] == 2
    assert p_data["due_at"] is None
    assert p_data["assignee"] is None
    assert p_data["title"] == "Build API"


def test_task_move_ordering_rebalance_and_completed_at(client: TestClient) -> None:
    token, _ = register_and_login(client, "move@example.com", display_name="Mover")
    _, proj = _create_org_and_project(client, token)
    cols = proj["columns"]
    todo_col = cols[1]
    done_col = next(c for c in cols if c["is_done"])

    tasks = []
    for i in range(3):
        r = client.post(
            f"/api/v1/projects/{proj['id']}/tasks",
            json={"title": f"Task {i}", "column_id": todo_col["id"]},
            headers=auth_headers(token),
        )
        assert r.status_code == 201
        tasks.append(r.json())

    # Move Task 2 to index 0 (top)
    m0 = client.post(
        f"/api/v1/projects/{proj['id']}/tasks/{tasks[2]['id']}/move",
        json={"column_id": todo_col["id"], "index": 0},
        headers=auth_headers(token),
    )
    assert m0.status_code == 200
    board = client.get(f"/api/v1/projects/{proj['id']}/board", headers=auth_headers(token)).json()
    todo_ids = [
        x["id"] for x in next(c for c in board["columns"] if c["id"] == todo_col["id"])["tasks"]
    ]
    assert todo_ids == [tasks[2]["id"], tasks[0]["id"], tasks[1]["id"]]

    # Move Task 2 into Done column -> sets completed_at
    mdone = client.post(
        f"/api/v1/projects/{proj['id']}/tasks/{tasks[2]['id']}/move",
        json={"column_id": done_col["id"], "index": 0},
        headers=auth_headers(token),
    )
    assert mdone.status_code == 200
    assert mdone.json()["completed_at"] is not None

    # Move back to To Do -> clears completed_at
    mback = client.post(
        f"/api/v1/projects/{proj['id']}/tasks/{tasks[2]['id']}/move",
        json={"column_id": todo_col["id"], "index": 1},
        headers=auth_headers(token),
    )
    assert mback.status_code == 200
    assert mback.json()["completed_at"] is None


def test_board_constant_query_count(client: TestClient, test_engine) -> None:
    token, _ = register_and_login(client, "perf@example.com", display_name="Perf")
    _, proj = _create_org_and_project(client, token)

    def _count_board_queries() -> int:
        count = 0

        def _before(_conn, _cursor, _stmt, _params, _ctx, _many):
            nonlocal count
            count += 1

        event.listen(test_engine, "before_cursor_execute", _before)
        try:
            res = client.get(f"/api/v1/projects/{proj['id']}/board", headers=auth_headers(token))
            assert res.status_code == 200
        finally:
            event.remove(test_engine, "before_cursor_execute", _before)
        return count

    # Create 2 tasks, measure query count
    for i in range(2):
        client.post(
            f"/api/v1/projects/{proj['id']}/tasks",
            json={"title": f"T{i}"},
            headers=auth_headers(token),
        )
    q_small = _count_board_queries()

    # Create 18 more tasks with subtasks and comments, verify query count does not grow with N
    for i in range(2, 20):
        t = client.post(
            f"/api/v1/projects/{proj['id']}/tasks",
            json={"title": f"T{i}"},
            headers=auth_headers(token),
        ).json()
        client.post(
            f"/api/v1/tasks/{t['id']}/subtasks",
            json={"title": "Sub"},
            headers=auth_headers(token),
        )
        client.post(
            f"/api/v1/tasks/{t['id']}/comments",
            json={"body": "Com"},
            headers=auth_headers(token),
        )
    q_large = _count_board_queries()
    assert q_large <= q_small + 1


def test_notifications_and_preferences(client: TestClient) -> None:
    t1, u1 = register_and_login(client, "lead@example.com", display_name="Lead")
    t2, u2 = register_and_login(client, "eng@example.com", display_name="Engineer")
    org, proj = _create_org_and_project(client, t1)

    inv = client.post(
        f"/api/v1/organizations/{org['id']}/invitations",
        json={"email": "eng@example.com", "role": "member"},
        headers=auth_headers(t1),
    ).json()
    tok = inv["invite_url"].split("/invite/")[-1]
    client.post("/api/v1/invitations/accept-token", json={"token": tok}, headers=auth_headers(t2))

    # u1 creates task assigned to u2 -> u2 gets notification, u1 does not
    task = client.post(
        f"/api/v1/projects/{proj['id']}/tasks",
        json={"title": "Notif Task", "assignee_id": u2["id"]},
        headers=auth_headers(t1),
    ).json()
    u2_notifs = client.get("/api/v1/notifications", headers=auth_headers(t2)).json()
    assert u2_notifs["unread_count"] >= 1
    assert (
        client.get("/api/v1/notifications/unread-count", headers=auth_headers(t1)).json()[
            "unread_count"
        ]
        == 0
    )

    # u2 disables on_comment preference -> comment from u1 creates no new notification
    client.put(
        "/api/v1/users/me/notification-preferences",
        json={
            "on_assigned": True,
            "on_comment": False,
            "on_status_change": True,
            "on_invitation": True,
        },
        headers=auth_headers(t2),
    )
    before_count = client.get(
        "/api/v1/notifications/unread-count", headers=auth_headers(t2)
    ).json()["unread_count"]
    client.post(
        f"/api/v1/tasks/{task['id']}/comments",
        json={"body": "Ping"},
        headers=auth_headers(t1),
    )
    after_count = client.get("/api/v1/notifications/unread-count", headers=auth_headers(t2)).json()[
        "unread_count"
    ]
    assert after_count == before_count

    # Mark all read
    read_all = client.post("/api/v1/notifications/read-all", headers=auth_headers(t2))
    assert read_all.status_code == 200
    assert read_all.json()["unread_count"] == 0
