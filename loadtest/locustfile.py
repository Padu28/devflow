from __future__ import annotations

from locust import HttpUser, between, task


class DevFlowUser(HttpUser):
    wait_time = between(0.5, 2.0)
    token: str = ""
    org_id: str = ""
    project_id: str = ""
    column_ids: list[str] = []

    def on_start(self) -> None:
        res = self.client.post(
            "/api/v1/auth/login",
            json={"email": "demo@devflow.dev", "password": "DemoPass123!"},
        )
        if res.status_code == 200:
            self.token = res.json()["access_token"]
            orgs = self.client.get("/api/v1/organizations", headers=self._headers()).json()
            if orgs:
                self.org_id = orgs[0]["id"]
                projs = self.client.get(
                    f"/api/v1/organizations/{self.org_id}/projects",
                    headers=self._headers(),
                ).json()
                if projs.get("items"):
                    self.project_id = projs["items"][0]["id"]
                    board = self.client.get(
                        f"/api/v1/projects/{self.project_id}/board",
                        headers=self._headers(),
                    ).json()
                    self.column_ids = [c["id"] for c in board.get("columns", [])]

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    @task(5)
    def load_board(self) -> None:
        if self.project_id:
            self.client.get(
                f"/api/v1/projects/{self.project_id}/board",
                headers=self._headers(),
                name="/projects/{id}/board",
            )

    @task(3)
    def list_tasks(self) -> None:
        if self.project_id:
            self.client.get(
                f"/api/v1/projects/{self.project_id}/tasks",
                headers=self._headers(),
                name="/projects/{id}/tasks",
            )

    @task(2)
    def search_workspace(self) -> None:
        if self.org_id:
            self.client.get(
                f"/api/v1/organizations/{self.org_id}/search?q=api",
                headers=self._headers(),
                name="/organizations/{id}/search",
            )

    @task(2)
    def analytics(self) -> None:
        if self.org_id:
            self.client.get(
                f"/api/v1/organizations/{self.org_id}/analytics/overview?days=30",
                headers=self._headers(),
                name="/organizations/{id}/analytics/overview",
            )

    @task(1)
    def create_and_move_task(self) -> None:
        if self.project_id and len(self.column_ids) >= 2:
            created = self.client.post(
                f"/api/v1/projects/{self.project_id}/tasks",
                json={"title": "Locust load task", "column_id": self.column_ids[0]},
                headers=self._headers(),
                name="/projects/{id}/tasks [POST]",
            )
            if created.status_code == 201:
                tid = created.json()["id"]
                self.client.post(
                    f"/api/v1/projects/{self.project_id}/tasks/{tid}/move",
                    json={"column_id": self.column_ids[1], "index": 0},
                    headers=self._headers(),
                    name="/projects/{id}/tasks/{task_id}/move",
                )

