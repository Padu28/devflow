# DevFlow — Entity Relationship Diagram

Matches `backend/app/models/` and the Alembic initial migration.

```mermaid
erDiagram
  users ||--o{ refresh_tokens : has
  users ||--o{ password_reset_tokens : has
  users ||--|| notification_preferences : configures
  users ||--o{ memberships : belongs
  organizations ||--o{ memberships : contains
  organizations ||--o{ invitations : sends
  organizations ||--o{ labels : scopes
  organizations ||--o{ projects : owns
  organizations ||--o{ activity_events : records
  projects ||--o{ project_members : assigns
  projects ||--o{ board_columns : has
  projects ||--o{ tasks : contains
  projects ||--o{ saved_views : stores
  board_columns ||--o{ tasks : holds
  tasks ||--o{ subtasks : breaks_down
  tasks ||--o{ comments : discusses
  tasks ||--o{ task_labels : tagged
  labels ||--o{ task_labels : tags
  activity_events ||--o{ notifications : fans_out

  users {
    uuid id PK
    string email UK
    string password_hash
    string display_name
    string avatar_color
    datetime created_at
  }
  organizations {
    uuid id PK
    string name
    string slug UK
    uuid created_by FK
    datetime created_at
  }
  memberships {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK
    string role
    datetime joined_at
  }
  projects {
    uuid id PK
    uuid organization_id FK
    string name
    string key
    string status
    string color
    int task_counter
    datetime archived_at
  }
  board_columns {
    uuid id PK
    uuid project_id FK
    string name
    int position
    int wip_limit
    bool is_done
  }
  tasks {
    uuid id PK
    uuid project_id FK
    uuid column_id FK
    int number
    string title
    string priority
    float position
    int version
    uuid assignee_id FK
    datetime due_at
    datetime completed_at
  }
```

## Key Constraints & Indexes
- **Unique constraints**: `users.email`, `organizations.slug`, `memberships(organization_id, user_id)`, `projects(organization_id, key)`, `tasks(project_id, number)`, `labels(organization_id, name)`.
- **Performance indexes**:
  - `ix_tasks_project_col_pos (project_id, column_id, position)`
  - `ix_tasks_assignee_id (assignee_id)` & `ix_tasks_due_at (due_at)`
  - `ix_activity_events_org_created (organization_id, created_at)`
  - `ix_notifications_recipient_read_created (recipient_id, read_at, created_at)`
  - `ix_memberships_user_id (user_id)`

