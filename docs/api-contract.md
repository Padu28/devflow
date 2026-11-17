# DevFlow — API Contract (source of truth)

> Written **before** implementation (roadmap: "Write API contracts first").
> Backend and frontend MUST both conform to this file. If a change is required, update this file first.

Base URL: `/api/v1` · JSON everywhere · IDs are UUID strings · timestamps are ISO-8601 UTC strings (`2026-11-16T09:00:00Z`).

---

## 0. Conventions

### Auth
* `Authorization: Bearer <access_token>` — short-lived JWT (HS256, 15 min). Claims: `sub` (user id), `type: "access"`, `iat`, `exp`, `jti`.
* Refresh token: opaque random string in an **httpOnly** cookie `devflow_refresh` (`SameSite=Lax`, `Secure` in production, `Path=/api/v1/auth`). Stored **hashed** (SHA-256) in `refresh_tokens`. Rotated on every refresh; re-use of a revoked token revokes the whole token *family* (theft detection).
* Frontend keeps the access token **in memory only**; on boot it calls `POST /auth/refresh` to restore the session.

### Error shape (every non-2xx)
```json
{ "error": { "code": "not_found", "message": "Task not found", "details": null }, "request_id": "9f1c..." }
```
| HTTP | code | when |
|---|---|---|
| 400 | `bad_request` | semantically invalid (e.g. delete non-empty column) |
| 401 | `unauthorized` | missing/invalid/expired token, bad credentials |
| 403 | `forbidden` | authenticated member but role is insufficient |
| 404 | `not_found` | resource missing **or belongs to another tenant** (never leak existence) |
| 409 | `conflict` / `stale_update` | uniqueness conflict / optimistic-concurrency version mismatch |
| 422 | `validation_error` | Pydantic validation; `details` = list of `{loc, msg, type}` |
| 429 | `rate_limited` | rate limit hit; `Retry-After` header set |
| 500 | `internal_error` | unexpected |

Every response carries an `X-Request-ID` header (echoes incoming header or generates one).

### Pagination
* Offset lists: query `page` (≥1, default 1), `page_size` (1–100, default 25) → 
  `{ "items": [...], "total": 42, "page": 1, "page_size": 25, "pages": 2 }`
* Cursor lists (activity, comments, notifications): query `cursor` (opaque string), `limit` (1–100, default 20) →
  `{ "items": [...], "next_cursor": "..." | null }`

### Shared object shapes
```ts
UserBrief   = { id, email, display_name, avatar_color }            // avatar_color: hex like "#7C5CFF"
User        = UserBrief & { created_at }
Label       = { id, name, color }
Column      = { id, project_id, name, position: int, color: string|null, wip_limit: int|null, is_done: bool }
Priority    = "urgent" | "high" | "medium" | "low" | "none"
OrgRole     = "owner" | "admin" | "member" | "viewer"
ProjectRole = "lead" | "contributor" | "viewer"
ProjectStatus = "active" | "paused" | "completed"

TaskCard = {
  id, project_id, column_id, number: int, key: string,               // key = `${project.key}-${number}` e.g. "WEB-12"
  title, priority: Priority, due_at: string|null, position: number,
  assignee: UserBrief|null, labels: Label[],
  subtask_count: int, subtask_done_count: int, comment_count: int,
  version: int, created_at, updated_at, completed_at: string|null
}
TaskDetail = TaskCard & {
  description: string,            // markdown, may be ""
  created_by: UserBrief,
  subtasks: Subtask[]
}
Subtask = { id, task_id, title, is_done: bool, position: int, created_at }
Comment = { id, task_id, author: UserBrief, body, created_at, updated_at, edited: bool }

ActivityEvent = {
  id, organization_id, project_id: string|null, actor: UserBrief,
  entity_type: "organization"|"project"|"task"|"comment"|"member"|"invitation"|"column",
  entity_id: string, action: string, metadata: object, created_at
}
// actions: project.created | project.updated | project.archived | project.unarchived |
//          task.created | task.updated | task.moved | task.assigned | task.deleted | task.completed |
//          comment.created | member.joined | member.role_changed | member.removed | invitation.sent
// metadata examples: task.moved → {task_key, task_title, from_column, to_column}
//                    task.assigned → {task_key, task_title, assignee_id, assignee_name}
//                    task.updated → {task_key, task_title, changes: ["priority","due_at"]}
//                    comment.created → {task_key, task_title, excerpt}

Notification = { id, organization_id, read_at: string|null, created_at, event: ActivityEvent }

OrganizationSummary = { id, name, slug, role: OrgRole, member_count, project_count, created_at }
Member = { user: UserBrief, role: OrgRole, joined_at }
Invitation = { id, organization_id, email, role: OrgRole, status: "pending"|"accepted"|"revoked"|"expired",
               invited_by: UserBrief, expires_at, created_at, invite_url: string|null } // invite_url only returned on create (contains token)
MyInvitation = { id, organization: {id, name, slug}, role: OrgRole, invited_by: UserBrief, expires_at }

ProjectSummary = {
  id, organization_id, name, key, description, status: ProjectStatus, color,
  archived_at: string|null, created_by: UserBrief, created_at, updated_at,
  task_count, open_count, done_count, member_count, members_preview: UserBrief[]  // ≤5
}
ProjectDetail = ProjectSummary & {
  columns: Column[], members: {user: UserBrief, project_role: ProjectRole}[],
  my_org_role: OrgRole, my_project_role: ProjectRole|null, can_edit: bool, can_manage: bool
}
SavedView = { id, project_id, name, filters: TaskFilters, created_at }
TaskFilters = { q?, assignee_id?, priority?, label_id?, due?: "overdue"|"this_week"|"none" }
```

---

## 1. Permission matrix (enforced server-side; UI only hides)

| Capability | owner | admin | member | viewer |
|---|:-:|:-:|:-:|:-:|
| Read org, projects, tasks, activity, analytics | ✓ | ✓ | ✓ | ✓ |
| Create / edit / move / delete tasks, comment, subtasks | ✓ | ✓ | ✓ | ✗ |
| Create project (creator becomes `lead`) | ✓ | ✓ | ✓ | ✗ |
| Edit project settings / columns / project members / archive | ✓ | ✓ | project `lead` only | ✗ |
| Delete project | ✓ | ✓ | ✗ | ✗ |
| Manage labels | ✓ | ✓ | ✓ | ✗ |
| Invite / revoke invitations, change member roles (≤ admin), remove members | ✓ | ✓ | ✗ | ✗ |
| Grant/revoke `owner` or `admin`, rename org | ✓ | (rename only) | ✗ | ✗ |
| Delete organization | ✓ | ✗ | ✗ | ✗ |

Rules: the last owner can't be demoted/removed; anyone may leave (except last owner); comment edit = author only; comment delete = author or admin+.
**Membership is the authorization boundary**: every org/project/task/comment lookup is joined through `memberships` for the current user. Non-members get **404**.

---

## 2. Health
| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/health` | – | `{status:"ok", version}` (liveness) |
| GET | `/ready` | – | `{status:"ready", database:"ok", redis:"ok"\|"disabled"}` or 503 |

(These two are mounted at the root **and** under `/api/v1`.)

## 3. Auth & users  (rate limited: 10 req/min/IP on register, login, password-reset)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{email, password, display_name}` password ≥ 8 chars, must contain a letter and a digit | 201 `{access_token, token_type:"bearer", expires_in, user: User}` + sets cookie |
| POST | `/auth/login` | `{email, password}` | 200 same as register |
| POST | `/auth/refresh` | (cookie) | 200 same as register (rotates cookie) · 401 if missing/invalid |
| POST | `/auth/logout` | (cookie) | 204, revokes refresh family, clears cookie |
| POST | `/auth/password-reset/request` | `{email}` | 202 `{message, dev_reset_token: string\|null}` — always 202 (no user enumeration); token only exposed when `ENVIRONMENT=development` (otherwise "emailed" via log) |
| POST | `/auth/password-reset/confirm` | `{token, new_password}` | 204; revokes all refresh tokens of user · 400 `invalid_token` |
| GET | `/auth/me` | – | `User` |
| PATCH | `/users/me` | `{display_name?, avatar_color?}` | `User` |
| POST | `/users/me/password` | `{current_password, new_password}` | 204 |
| GET | `/users/me/notification-preferences` | – | `{on_assigned, on_comment, on_status_change, on_invitation}` (bools) |
| PUT | `/users/me/notification-preferences` | same | same |

## 4. Organizations, members, invitations
| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/organizations` | – | `OrganizationSummary[]` (only where I'm a member) |
| POST | `/organizations` | `{name, slug?}` slug auto-generated from name if missing, unique | 201 `OrganizationSummary` (creator = owner; seeds 4 default labels: Bug, Feature, Design, Docs) |
| GET | `/organizations/{org_id}` | – | `OrganizationSummary` |
| PATCH | `/organizations/{org_id}` | `{name}` | `OrganizationSummary` (admin+) |
| DELETE | `/organizations/{org_id}` | – | 204 (owner) |
| GET | `/organizations/{org_id}/members` | – | `Member[]` |
| PATCH | `/organizations/{org_id}/members/{user_id}` | `{role}` | `Member` |
| DELETE | `/organizations/{org_id}/members/{user_id}` | – | 204 (admin+ or self) |
| GET | `/organizations/{org_id}/invitations` | – | `Invitation[]` pending only (admin+) |
| POST | `/organizations/{org_id}/invitations` | `{email, role}` role ≠ owner | 201 `Invitation` with `invite_url` = `${FRONTEND_URL}/invite/${token}` · 409 if already member/pending |
| DELETE | `/organizations/{org_id}/invitations/{invitation_id}` | – | 204 (revoke) |
| GET | `/invitations` | – | `MyInvitation[]` (pending, addressed to my email) |
| POST | `/invitations/{invitation_id}/accept` | – | `OrganizationSummary` |
| POST | `/invitations/{invitation_id}/decline` | – | 204 |
| POST | `/invitations/accept-token` | `{token}` | `OrganizationSummary` · 400 invalid/expired · 403 if email mismatch |
| GET | `/organizations/{org_id}/labels` | – | `Label[]` |
| POST | `/organizations/{org_id}/labels` | `{name, color}` | 201 `Label` |
| PATCH | `/organizations/{org_id}/labels/{label_id}` | `{name?, color?}` | `Label` |
| DELETE | `/organizations/{org_id}/labels/{label_id}` | – | 204 |
| GET | `/organizations/{org_id}/search` | `q` (≥1 char), `limit` (≤20, default 8) | `{tasks: (TaskCard & {project_name, project_color})[], projects: ProjectSummary[]}` |
| GET | `/organizations/{org_id}/activity` | cursor, limit | cursor page of `ActivityEvent` |

## 5. Projects & columns
| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/organizations/{org_id}/projects` | `q?`, `status?`, `archived` (bool, default false), `page`, `page_size` | page of `ProjectSummary` (sorted by updated_at desc) |
| POST | `/organizations/{org_id}/projects` | `{name, key?, description?, color?, member_ids?: string[]}` key: 2–6 uppercase letters, derived from name if missing, unique per org | 201 `ProjectDetail` — creates default columns **Backlog, To Do, In Progress, In Review, Done (is_done)** |
| GET | `/projects/{project_id}` | – | `ProjectDetail` |
| PATCH | `/projects/{project_id}` | `{name?, description?, status?, color?}` | `ProjectDetail` |
| POST | `/projects/{project_id}/archive` · `/unarchive` | – | `ProjectDetail` |
| DELETE | `/projects/{project_id}` | – | 204 |
| POST | `/projects/{project_id}/members` | `{user_id, project_role}` (user must be org member) | `ProjectDetail` |
| DELETE | `/projects/{project_id}/members/{user_id}` | – | 204 |
| POST | `/projects/{project_id}/columns` | `{name, color?, wip_limit?, is_done?}` | 201 `Column` (appended) |
| PATCH | `/projects/{project_id}/columns/{column_id}` | `{name?, color?, wip_limit?, is_done?}` | `Column` |
| DELETE | `/projects/{project_id}/columns/{column_id}` | query `move_to?` column id | 204 · 400 if non-empty and no `move_to` |
| POST | `/projects/{project_id}/columns/reorder` | `{column_ids: string[]}` (full ordered list) | `Column[]` |

## 6. Board, tasks, subtasks, comments
| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/projects/{project_id}/board` | filters: `q?, assignee_id?` (`"me"` or `"none"` allowed), `priority?, label_id?, due?` | `{project: ProjectDetail, columns: (Column & {tasks: TaskCard[]})[]}` tasks ordered by position — loaded with a **constant number of queries** (no N+1) |
| GET | `/projects/{project_id}/tasks` | filters above + `column_id?`, `sort` ∈ `position, created_at, -created_at, due_at, -due_at, priority, -updated_at` (default `-updated_at`), `page`, `page_size` | page of `TaskCard` |
| POST | `/projects/{project_id}/tasks` | `{title, description?, column_id?, priority?, due_at?, assignee_id?, label_ids?}` (defaults: first non-done column, `"none"`) appended to bottom | 201 `TaskDetail` |
| GET | `/projects/{project_id}/tasks/{task_id}` | – | `TaskDetail` |
| PATCH | `/projects/{project_id}/tasks/{task_id}` | `{version (required), title?, description?, priority?, due_at?, assignee_id?, label_ids?}` explicit `null` clears due_at/assignee | `TaskDetail` · **409 `stale_update`** if `version` ≠ current |
| POST | `/projects/{project_id}/tasks/{task_id}/move` | `{column_id, index}` — target 0-based index in destination column (computed excluding the moved task) | `TaskCard` (new position, version+1). Runs in a transaction with row locks; position = midpoint of neighbours; column rebalanced when gap < 1e-6. Moving into an `is_done` column sets `completed_at`. |
| DELETE | `/projects/{project_id}/tasks/{task_id}` | – | 204 |
| POST | `/tasks/{task_id}/subtasks` | `{title}` | 201 `Subtask` |
| PATCH | `/tasks/{task_id}/subtasks/{subtask_id}` | `{title?, is_done?}` | `Subtask` |
| DELETE | `/tasks/{task_id}/subtasks/{subtask_id}` | – | 204 |
| GET | `/tasks/{task_id}/comments` | cursor, limit (oldest → newest) | cursor page of `Comment` |
| POST | `/tasks/{task_id}/comments` | `{body}` (1–5000 chars) | 201 `Comment` |
| PATCH | `/tasks/{task_id}/comments/{comment_id}` | `{body}` | `Comment` |
| DELETE | `/tasks/{task_id}/comments/{comment_id}` | – | 204 |
| GET | `/projects/{project_id}/activity` | cursor, limit (newest first) | cursor page of `ActivityEvent` |
| GET | `/projects/{project_id}/views` | – | `SavedView[]` (mine) |
| POST | `/projects/{project_id}/views` | `{name, filters}` | 201 `SavedView` |
| DELETE | `/projects/{project_id}/views/{view_id}` | – | 204 |

Every mutation writes an immutable `activity_events` row **and** publishes a realtime event (after commit).

## 7. Notifications
| Method | Path | Query/Body | Response |
|---|---|---|---|
| GET | `/notifications` | `unread_only?`, cursor, limit | `{items: Notification[], next_cursor, unread_count}` (newest first) |
| GET | `/notifications/unread-count` | – | `{unread_count}` |
| POST | `/notifications/{notification_id}/read` | – | `Notification` |
| POST | `/notifications/read-all` | – | `{unread_count: 0}` |

Created (respecting preferences, never for the actor themself) when: you're assigned a task (`on_assigned`); a comment is added to a task you created or are assigned to (`on_comment`); a task you created or are assigned to is moved to another column (`on_status_change`); you're invited to an org and already have an account (`on_invitation`).

## 8. Analytics (real aggregates)
`GET /organizations/{org_id}/analytics/overview?project_id=&days=30` (days 7–90)
```json
{
  "totals": {"tasks": 120, "open": 80, "completed": 40, "overdue": 7, "due_this_week": 12},
  "by_status": [{"name": "In Progress", "count": 14, "is_done": false}],
  "by_priority": [{"priority": "high", "count": 9}],
  "completion_trend": [{"date": "2026-11-01", "created": 4, "completed": 2}],
  "workload": [{"user": UserBrief, "open": 6, "overdue": 1, "completed": 9}],
  "project_activity": [{"project_id": "...", "name": "Website", "color": "#...", "events": 34}]
}
```
`completion_trend` has one entry per day for the full window (zero-filled). `by_status` groups by column name (merged across projects when no `project_id`).

## 9. Realtime — WebSocket
`WS /api/v1/ws/organizations/{org_id}?token=<access_token>`
* On connect: token validated + membership checked → otherwise close code **4401** (bad token) / **4403** (not a member).
* Membership is **re-checked on delivery** (cached ≤ 30 s, invalidated on member removal → socket closed with 4403).
* Server → client envelope:
```json
{
  "event_id": "uuid", "type": "task.moved", "tenant_id": "<org_id>", "actor_id": "<user_id>",
  "entity_id": "<task_id>", "project_id": "<project_id>|null", "timestamp": "ISO", "payload": { }
}
```
| type | payload |
|---|---|
| `hello` | `{user_id, server_time}` |
| `task.created` / `task.updated` / `task.moved` | `{task: TaskCard}` (`task.moved` also `{from_column_id}`) |
| `task.deleted` | `{task_id, column_id}` |
| `comment.created` | `{comment: Comment}` |
| `project.updated` | `{project_id}` (clients refetch) |
| `columns.updated` | `{project_id}` (clients refetch board) |
| `notification.created` | `{notification: Notification}` — **sent only to the recipient** |
| `presence.state` | `{users: [{user: UserBrief, project_id: string\|null}]}` — broadcast to the org whenever presence changes |
| `pong` | `{}` |
* Client → server: `{"type":"ping"}` (every 25 s), `{"type":"presence.view","project_id": "...|null"}`.
* Client duties: exponential backoff with jitter (1 s → 30 s cap), dedupe by `event_id` (LRU of last 500), ignore events where `actor_id` = me **and** an optimistic update is pending, on reconnect invalidate board/notification queries (fallback refresh), poll every 30 s while disconnected.
* Fan-out: in-process `ConnectionManager`; when `REDIS_URL` is set, events are published to Redis channel `devflow:org:{org_id}` so multiple API instances stay in sync.

## 10. Seed data (sanitized)
`python -m app.scripts.seed` → org **Acme Labs** (`acme-labs`), users (password `DemoPass123!` for all):
`demo@devflow.dev` (owner, "Demo User"), `priya@devflow.dev` (admin), `alex@devflow.dev` (member), `sam@devflow.dev` (viewer).
Projects: **Website Relaunch (WEB)**, **Mobile App (MOB)**, **Platform API (API)** with ~45 realistic tasks, labels, subtasks, comments, back-dated activity over the past 30 days (so analytics look alive). Idempotent (skips if demo user exists).

