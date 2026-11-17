# DevFlow — Permission Matrix

| Capability | Owner | Admin | Member | Viewer |
|---|:-:|:-:|:-:|:-:|
| Read org, projects, tasks, activity, analytics | ✓ | ✓ | ✓ | ✓ |
| Create / edit / move / delete tasks, comment, subtasks | ✓ | ✓ | ✓ | ✗ |
| Create project (creator becomes `lead`) | ✓ | ✓ | ✓ | ✗ |
| Edit project settings / columns / project members / archive | ✓ | ✓ | Project `lead` only | ✗ |
| Delete project | ✓ | ✓ | ✗ | ✗ |
| Manage labels | ✓ | ✓ | ✓ | ✗ |
| Invite / revoke invitations, change roles (≤ admin), remove members | ✓ | ✓ | ✗ | ✗ |
| Grant/revoke `owner` or `admin`, rename org | ✓ | Rename only | ✗ | ✗ |
| Delete organization | ✓ | ✗ | ✗ | ✗ |

## Enforcement Rules
- **Membership is the authorization boundary**: Every organization, project, task, subtask, and comment query joins through `memberships` for `current_user.id`. Non-members receive **404 Not Found** to prevent resource ID enumeration.
- **Role checks**: Authenticated members lacking the required role receive **403 Forbidden**.
- **Last-owner invariant**: The last `owner` of an organization cannot be demoted or removed.

