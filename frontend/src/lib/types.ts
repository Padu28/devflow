export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';
export type ProjectRole = 'lead' | 'contributor' | 'viewer';
export type ProjectStatus = 'active' | 'paused' | 'completed';

export interface UserBrief {
  id: string;
  email: string;
  display_name: string;
  avatar_color: string;
}

export interface User extends UserBrief {
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface NotificationPreferences {
  on_assigned: boolean;
  on_comment: boolean;
  on_status_change: boolean;
  on_invitation: boolean;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Column {
  id: string;
  project_id: string;
  name: string;
  position: number;
  color: string | null;
  wip_limit: number | null;
  is_done: boolean;
}

export interface TaskCard {
  id: string;
  project_id: string;
  column_id: string;
  number: number;
  key: string;
  title: string;
  priority: Priority;
  due_at: string | null;
  position: number;
  assignee: UserBrief | null;
  labels: Label[];
  subtask_count: number;
  subtask_done_count: number;
  comment_count: number;
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  position: number;
  created_at: string;
}

export interface TaskDetail extends TaskCard {
  description: string;
  created_by: UserBrief;
  subtasks: Subtask[];
}

export interface Comment {
  id: string;
  task_id: string;
  author: UserBrief;
  body: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
}

export interface ActivityEvent {
  id: string;
  organization_id: string;
  project_id: string | null;
  actor: UserBrief;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Notification {
  id: string;
  organization_id: string;
  read_at: string | null;
  created_at: string;
  event: ActivityEvent;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  member_count: number;
  project_count: number;
  created_at: string;
}

export interface Member {
  user: UserBrief;
  role: OrgRole;
  joined_at: string;
}

export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: OrgRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invited_by: UserBrief;
  expires_at: string;
  created_at: string;
  invite_url: string | null;
}

export interface MyInvitation {
  id: string;
  organization: { id: string; name: string; slug: string };
  role: OrgRole;
  invited_by: UserBrief;
  expires_at: string;
}

export interface ProjectSummary {
  id: string;
  organization_id: string;
  name: string;
  key: string;
  description: string;
  status: ProjectStatus;
  color: string;
  archived_at: string | null;
  created_by: UserBrief;
  created_at: string;
  updated_at: string;
  task_count: number;
  open_count: number;
  done_count: number;
  member_count: number;
  members_preview: UserBrief[];
}

export interface ProjectMember {
  user: UserBrief;
  project_role: ProjectRole;
}

export interface ProjectDetail extends ProjectSummary {
  columns: Column[];
  members: ProjectMember[];
  my_org_role: OrgRole;
  my_project_role: ProjectRole | null;
  can_edit: boolean;
  can_manage: boolean;
}

export interface BoardColumnWithTasks extends Column {
  tasks: TaskCard[];
}

export interface BoardData {
  project: ProjectDetail;
  columns: BoardColumnWithTasks[];
}

export interface TaskFilters {
  q?: string;
  assignee_id?: string;
  priority?: Priority;
  label_id?: string;
  due?: 'overdue' | 'this_week' | 'none';
}

export interface SavedView {
  id: string;
  project_id: string;
  name: string;
  filters: TaskFilters;
  created_at: string;
}

export interface PageResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface CursorResponse<T> {
  items: T[];
  next_cursor: string | null;
}

export interface NotificationListResponse extends CursorResponse<Notification> {
  unread_count: number;
}

export interface AnalyticsOverview {
  totals: {
    tasks: number;
    open: number;
    completed: number;
    overdue: number;
    due_this_week: number;
  };
  by_status: { name: string; count: number; is_done: boolean }[];
  by_priority: { priority: Priority; count: number }[];
  completion_trend: { date: string; created: number; completed: number }[];
  workload: { user: UserBrief; open: number; overdue: number; completed: number }[];
  project_activity: { project_id: string; name: string; color: string; events: number }[];
}

export interface SearchResponse {
  tasks: (TaskCard & { project_name: string; project_color: string })[];
  projects: ProjectSummary[];
}

export interface PresenceUser {
  user: UserBrief;
  project_id: string | null;
}

export interface RealtimeEnvelope {
  event_id: string;
  type: string;
  tenant_id: string;
  actor_id: string;
  entity_id: string;
  project_id: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
}

