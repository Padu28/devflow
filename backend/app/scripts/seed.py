"""Idempotent seed script for DevFlow demo workspace (Acme Labs)."""

from __future__ import annotations

import logging
import random
from datetime import timedelta

from sqlalchemy import select

from app.core.security import hash_password
from app.db.base import utcnow
from app.db.session import SessionLocal
from app.models.activity import ActivityEvent, Notification
from app.models.organization import Membership, Organization
from app.models.project import BoardColumn, Label, Project, ProjectMember
from app.models.task import Comment, Subtask, Task
from app.models.user import NotificationPreference, User
from app.services.org_service import DEFAULT_LABELS
from app.services.project_service import DEFAULT_COLUMNS

logger = logging.getLogger(__name__)

DEMO_USERS = [
    ("demo@devflow.dev", "Demo User", "#C6F432", "owner"),
    ("priya@devflow.dev", "Priya Nair", "#38BDF8", "admin"),
    ("alex@devflow.dev", "Alex Rivera", "#A78BFA", "member"),
    ("sam@devflow.dev", "Sam Chen", "#FB923C", "viewer"),
]

PROJECTS_SPEC = [
    (
        "Website Relaunch",
        "WEB",
        "Marketing site refresh with interactive product preview and docs.",
        "#C6F432",
        [
            ("Implement kinetic hero flow-field canvas", "high", 2, 0),
            ("Add perspective-tilted Kanban preview", "urgent", 3, 1),
            ("Optimize fontsubset loading for Space Grotesk", "medium", 4, 1),
            ("Responsive mobile navigation drawer", "medium", 1, 2),
            ("Add OpenGraph & Twitter meta tags", "low", 0, 2),
            ("Audit WCAG AA contrast in light mode", "high", 2, 1),
            ("Build stack badge marquee strip", "low", 4, 0),
            ("Write copy for engineering architecture section", "medium", 3, 2),
            ("Configure Vite manualChunks splitting", "high", 4, 1),
            ("Add reduced-motion fallbacks for hero", "high", 2, 0),
            ("Create 404 and offline fallback views", "low", 1, 2),
            ("Connect Try Live Demo CTA to auth flow", "urgent", 2, 1),
            ("Lighthouse performance pass (>=95)", "medium", 0, 0),
            ("Deploy static bundle with gzip & cache headers", "low", 4, 1),
            ("Set up Playwright smoke suite for landing", "medium", 1, 2),
        ],
    ),
    (
        "Mobile App",
        "MOB",
        "iOS & Android companion client for push notifications and quick triage.",
        "#38BDF8",
        [
            ("Design dark-first task detail sheet", "high", 2, 1),
            ("Implement offline queue with optimistic sync", "urgent", 1, 2),
            ("Push notification deep-linking to task key", "high", 3, 1),
            ("Swipe gestures for column transitions", "medium", 0, 2),
            ("Biometric lock screen with refresh token", "medium", 4, 0),
            ("Workspace switcher bottom sheet", "low", 4, 1),
            ("Comment mention autocomplete", "medium", 1, 2),
            ("Subtask checklist haptic feedback", "low", 2, 0),
            ("Crash reporting & breadcrumbs integration", "high", 3, 1),
            ("Beta TestFlight build pipeline", "medium", 4, 2),
            ("Filter tasks by assignee and due date", "low", 2, 1),
            ("Image attachment preview modal", "none", 0, 2),
            ("Accessibility VoiceOver labels audit", "high", 1, 0),
            ("Reduce cold start under 600ms", "medium", 3, 1),
            ("App Store screenshots & release notes", "low", 4, 2),
        ],
    ),
    (
        "Platform API",
        "API",
        "FastAPI modular monolith, PostgreSQL schema, WebSocket fan-out and CI.",
        "#A78BFA",
        [
            ("Enforce tenant isolation across all endpoints", "urgent", 4, 0),
            ("Implement rotating refresh token family detection", "urgent", 4, 1),
            ("Fractional midpoint task ordering with row locks", "high", 4, 1),
            ("Constant-query board loader (no N+1)", "high", 3, 0),
            ("WebSocket presence & Redis pub/sub bridge", "high", 2, 1),
            ("Rate limiting sliding window on auth routes", "medium", 4, 2),
            ("Optimistic concurrency version check (409)", "high", 3, 1),
            ("Analytics completion trend SQL aggregates", "medium", 2, 0),
            ("Cursor pagination for activity & notifications", "medium", 4, 1),
            ("Structured JSON logging with X-Request-ID", "low", 4, 2),
            ("Alembic initial migration & Postgres CI test", "high", 4, 0),
            ("EXPLAIN ANALYZE index verification", "medium", 1, 1),
            ("Password reset token single-use expiry", "medium", 2, 2),
            ("Docker multi-stage slim image & non-root user", "low", 1, 0),
            ("Locust load test & benchmark script", "low", 0, 1),
        ],
    ),
]


def seed_demo_data() -> bool:
    """Seed Acme Labs demo data. Returns True if seeded, False if already present."""
    rng = random.Random(42)  # noqa: S311
    now = utcnow()
    pw_hash = hash_password("DemoPass123!")

    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.email == "demo@devflow.dev")) is not None:
            return False

        users: list[User] = []
        for email, name, color, _role in DEMO_USERS:
            u = User(email=email, password_hash=pw_hash, display_name=name, avatar_color=color)
            db.add(u)
            db.flush()
            db.add(NotificationPreference(user_id=u.id))
            users.append(u)

        owner = users[0]
        org = Organization(name="Acme Labs", slug="acme-labs", created_by=owner.id)
        db.add(org)
        db.flush()

        for u, (_, _, _, role) in zip(users, DEMO_USERS, strict=True):
            db.add(Membership(organization_id=org.id, user_id=u.id, role=role))

        labels: list[Label] = []
        for lname, lcolor in DEFAULT_LABELS:
            lb = Label(organization_id=org.id, name=lname, color=lcolor)
            db.add(lb)
            labels.append(lb)
        db.flush()

        assignable_users = users[:3]  # owner, admin, member

        for proj_name, proj_key, proj_desc, proj_color, task_specs in PROJECTS_SPEC:
            proj = Project(
                organization_id=org.id,
                name=proj_name,
                key=proj_key,
                description=proj_desc,
                status="active",
                color=proj_color,
                task_counter=len(task_specs),
                created_by=owner.id,
                created_at=now - timedelta(days=30),
                updated_at=now - timedelta(hours=rng.randint(1, 24)),
            )
            db.add(proj)
            db.flush()

            for idx, u in enumerate(users):
                prole = "lead" if idx == 0 else ("viewer" if idx == 3 else "contributor")
                db.add(ProjectMember(project_id=proj.id, user_id=u.id, project_role=prole))

            cols: list[BoardColumn] = []
            for cidx, (cname, ccolor, is_done) in enumerate(DEFAULT_COLUMNS):
                col = BoardColumn(
                    project_id=proj.id,
                    name=cname,
                    position=cidx,
                    color=ccolor,
                    is_done=is_done,
                    wip_limit=5 if cname == "In Progress" else None,
                )
                db.add(col)
                cols.append(col)
            db.flush()

            col_positions = {c.id: 0.0 for c in cols}
            for t_idx, (title, priority, col_idx, assignee_idx) in enumerate(task_specs, start=1):
                col = cols[col_idx]
                col_positions[col.id] += 1024.0
                created_days_ago = rng.randint(2, 28)
                created_at = now - timedelta(days=created_days_ago, hours=rng.randint(0, 12))
                completed_at = (
                    created_at + timedelta(days=rng.randint(1, max(1, created_days_ago - 1)))
                    if col.is_done
                    else None
                )
                due_at = None
                if not col.is_done and t_idx % 3 == 0:
                    due_at = now + timedelta(days=rng.choice([-3, -1, 2, 5, 10]))

                assignee = assignable_users[assignee_idx % len(assignable_users)]
                task = Task(
                    project_id=proj.id,
                    column_id=col.id,
                    number=t_idx,
                    title=title,
                    description=(
                        f"Implement **{title.lower()}** per DevFlow standards.\n\n"
                        "- Verify tenant isolation and permissions\n"
                        "- Add unit & integration tests"
                    ),
                    priority=priority,
                    due_at=due_at,
                    position=col_positions[col.id],
                    created_by=owner.id,
                    assignee_id=assignee.id,
                    created_at=created_at,
                    updated_at=completed_at or created_at,
                    completed_at=completed_at,
                )
                task.labels = [labels[(t_idx + col_idx) % len(labels)]]
                db.add(task)
                db.flush()

                if t_idx <= 6:
                    db.add(
                        Subtask(
                            task_id=task.id,
                            title="Draft schema & API contract",
                            is_done=True,
                            position=0,
                        )
                    )
                    db.add(
                        Subtask(
                            task_id=task.id,
                            title="Add automated test coverage",
                            is_done=col.is_done,
                            position=1,
                        )
                    )

                if t_idx % 4 == 0:
                    commenter = assignable_users[(assignee_idx + 1) % len(assignable_users)]
                    c = Comment(
                        task_id=task.id,
                        author_id=commenter.id,
                        body=f"Reviewed `{proj_key}-{t_idx}` — looks solid, ready for next stage.",
                        created_at=created_at + timedelta(hours=4),
                        updated_at=created_at + timedelta(hours=4),
                    )
                    db.add(c)

                ev = ActivityEvent(
                    organization_id=org.id,
                    project_id=proj.id,
                    actor_id=assignee.id,
                    entity_type="task",
                    entity_id=task.id,
                    action="task.moved" if col.is_done else "task.created",
                    metadata_json={
                        "task_key": f"{proj_key}-{t_idx}",
                        "task_title": title,
                        "from_column": "In Review",
                        "to_column": col.name,
                    },
                    created_at=completed_at or created_at,
                )
                db.add(ev)
                db.flush()

                if t_idx == 2 and proj_key == "WEB":
                    db.add(
                        Notification(
                            recipient_id=owner.id,
                            organization_id=org.id,
                            event_id=ev.id,
                            created_at=ev.created_at,
                        )
                    )

        db.commit()
        return True


if __name__ == "__main__":
    seeded = seed_demo_data()
    print("Seeded Acme Labs demo workspace." if seeded else "Demo data already present; skipped.")
