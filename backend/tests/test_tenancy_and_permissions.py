from __future__ import annotations

from fastapi.testclient import TestClient
from tests.conftest import auth_headers, register_and_login


def _setup_two_orgs(client: TestClient):
    t1, u1 = register_and_login(client, "owner1@example.com", display_name="Owner One")
    t2, u2 = register_and_login(client, "owner2@example.com", display_name="Owner Two")

    org1 = client.post(
        "/api/v1/organizations", json={"name": "Org One"}, headers=auth_headers(t1)
    ).json()
    org2 = client.post(
        "/api/v1/organizations", json={"name": "Org Two"}, headers=auth_headers(t2)
    ).json()

    proj1 = client.post(
        f"/api/v1/organizations/{org1['id']}/projects",
        json={"name": "Alpha", "key": "ALP"},
        headers=auth_headers(t1),
    ).json()

    task1 = client.post(
        f"/api/v1/projects/{proj1['id']}/tasks",
        json={"title": "Secret task"},
        headers=auth_headers(t1),
    ).json()

    sub1 = client.post(
        f"/api/v1/tasks/{task1['id']}/subtasks",
        json={"title": "Secret sub"},
        headers=auth_headers(t1),
    ).json()

    com1 = client.post(
        f"/api/v1/tasks/{task1['id']}/comments",
        json={"body": "Secret comment"},
        headers=auth_headers(t1),
    ).json()

    view1 = client.post(
        f"/api/v1/projects/{proj1['id']}/views",
        json={"name": "My View", "filters": {}},
        headers=auth_headers(t1),
    ).json()

    labels1 = client.get(
        f"/api/v1/organizations/{org1['id']}/labels", headers=auth_headers(t1)
    ).json()

    return {
        "t1": t1,
        "u1": u1,
        "t2": t2,
        "u2": u2,
        "org1": org1,
        "org2": org2,
        "proj1": proj1,
        "task1": task1,
        "sub1": sub1,
        "com1": com1,
        "view1": view1,
        "label1": labels1[0],
    }


def test_cross_tenant_isolation_returns_404(client: TestClient) -> None:
    ctx = _setup_two_orgs(client)
    h2 = auth_headers(ctx["t2"])
    org1_id = ctx["org1"]["id"]
    proj1_id = ctx["proj1"]["id"]
    task1_id = ctx["task1"]["id"]

    # Org endpoints
    assert client.get(f"/api/v1/organizations/{org1_id}", headers=h2).status_code == 404
    assert (
        client.patch(f"/api/v1/organizations/{org1_id}", json={"name": "X"}, headers=h2).status_code
        == 404
    )
    assert client.delete(f"/api/v1/organizations/{org1_id}", headers=h2).status_code == 404
    assert client.get(f"/api/v1/organizations/{org1_id}/members", headers=h2).status_code == 404
    assert client.get(f"/api/v1/organizations/{org1_id}/invitations", headers=h2).status_code == 404
    assert client.get(f"/api/v1/organizations/{org1_id}/labels", headers=h2).status_code == 404
    assert (
        client.patch(
            f"/api/v1/organizations/{org1_id}/labels/{ctx['label1']['id']}",
            json={"name": "Z"},
            headers=h2,
        ).status_code
        == 404
    )
    assert (
        client.get(f"/api/v1/organizations/{org1_id}/search?q=Secret", headers=h2).status_code
        == 404
    )
    assert client.get(f"/api/v1/organizations/{org1_id}/activity", headers=h2).status_code == 404
    assert (
        client.get(f"/api/v1/organizations/{org1_id}/analytics/overview", headers=h2).status_code
        == 404
    )

    # Project & board endpoints
    assert client.get(f"/api/v1/organizations/{org1_id}/projects", headers=h2).status_code == 404
    assert client.get(f"/api/v1/projects/{proj1_id}", headers=h2).status_code == 404
    assert client.get(f"/api/v1/projects/{proj1_id}/board", headers=h2).status_code == 404
    assert client.get(f"/api/v1/projects/{proj1_id}/tasks", headers=h2).status_code == 404
    assert client.get(f"/api/v1/projects/{proj1_id}/activity", headers=h2).status_code == 404
    assert client.get(f"/api/v1/projects/{proj1_id}/views", headers=h2).status_code == 404
    assert (
        client.delete(
            f"/api/v1/projects/{proj1_id}/views/{ctx['view1']['id']}", headers=h2
        ).status_code
        == 404
    )

    # Task, subtask, comment endpoints
    assert (
        client.get(f"/api/v1/projects/{proj1_id}/tasks/{task1_id}", headers=h2).status_code == 404
    )
    assert (
        client.patch(
            f"/api/v1/projects/{proj1_id}/tasks/{task1_id}",
            json={"version": 1, "title": "Hacked"},
            headers=h2,
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/api/v1/projects/{proj1_id}/tasks/{task1_id}", headers=h2).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/tasks/{task1_id}/subtasks/{ctx['sub1']['id']}",
            json={"is_done": True},
            headers=h2,
        ).status_code
        == 404
    )
    assert client.get(f"/api/v1/tasks/{task1_id}/comments", headers=h2).status_code == 404
    assert (
        client.post(
            f"/api/v1/tasks/{task1_id}/comments", json={"body": "Hi"}, headers=h2
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/tasks/{task1_id}/comments/{ctx['com1']['id']}",
            json={"body": "Hi"},
            headers=h2,
        ).status_code
        == 404
    )


def test_invitations_roles_and_viewer_restrictions(client: TestClient) -> None:
    t_owner, u_owner = register_and_login(client, "own@example.com", display_name="Owner")
    t_viewer, u_viewer = register_and_login(client, "view@example.com", display_name="Viewer")
    t_other, _ = register_and_login(client, "other@example.com", display_name="Other")

    org = client.post(
        "/api/v1/organizations", json={"name": "Acme"}, headers=auth_headers(t_owner)
    ).json()
    org_id = org["id"]

    # Invite viewer
    inv = client.post(
        f"/api/v1/organizations/{org_id}/invitations",
        json={"email": "view@example.com", "role": "viewer"},
        headers=auth_headers(t_owner),
    )
    assert inv.status_code == 201
    invite_url = inv.json()["invite_url"]
    token_str = invite_url.split("/invite/")[-1]

    # Duplicate pending invite returns 409
    dup = client.post(
        f"/api/v1/organizations/{org_id}/invitations",
        json={"email": "view@example.com", "role": "viewer"},
        headers=auth_headers(t_owner),
    )
    assert dup.status_code == 409

    # Wrong user trying to accept token gets 403
    wrong = client.post(
        "/api/v1/invitations/accept-token",
        json={"token": token_str},
        headers=auth_headers(t_other),
    )
    assert wrong.status_code == 403

    # Viewer sees it in /invitations and accepts by token
    my_invs = client.get("/api/v1/invitations", headers=auth_headers(t_viewer)).json()
    assert len(my_invs) == 1
    acc = client.post(
        "/api/v1/invitations/accept-token",
        json={"token": token_str},
        headers=auth_headers(t_viewer),
    )
    assert acc.status_code == 200
    assert acc.json()["role"] == "viewer"

    # Owner creates project + task
    proj = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        json={"name": "Core"},
        headers=auth_headers(t_owner),
    ).json()
    task = client.post(
        f"/api/v1/projects/{proj['id']}/tasks",
        json={"title": "Init"},
        headers=auth_headers(t_owner),
    ).json()

    # Viewer can read board, cannot mutate (403)
    assert (
        client.get(
            f"/api/v1/projects/{proj['id']}/board", headers=auth_headers(t_viewer)
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/v1/projects/{proj['id']}/tasks",
            json={"title": "Nope"},
            headers=auth_headers(t_viewer),
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/tasks/{task['id']}/comments",
            json={"body": "Nope"},
            headers=auth_headers(t_viewer),
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/organizations/{org_id}/projects",
            json={"name": "Nope"},
            headers=auth_headers(t_viewer),
        ).status_code
        == 403
    )

    # Last owner cannot be demoted or leave
    demote_last = client.patch(
        f"/api/v1/organizations/{org_id}/members/{u_owner['id']}",
        json={"role": "admin"},
        headers=auth_headers(t_owner),
    )
    assert demote_last.status_code == 400
    leave_last = client.delete(
        f"/api/v1/organizations/{org_id}/members/{u_owner['id']}",
        headers=auth_headers(t_owner),
    )
    assert leave_last.status_code == 400
