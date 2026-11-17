# DevFlow — One-Page Problem Statement

## Target User
Engineering leads, product managers, and small-to-mid-sized software teams (5–50 people) managing concurrent projects, sprints, and cross-functional tasks.

## Problem
Many lightweight task trackers lack strict multi-tenant data isolation, real-time synchronization, and clear role-based boundaries, while enterprise tools are slow, cluttered, and expensive.

## Primary Workflow (MVP)
1. Register or sign in → create a workspace (organization).
2. Invite teammates by email with role-based permissions (`admin`, `member`, `viewer`).
3. Create a project with default Kanban columns (`Backlog`, `To Do`, `In Progress`, `In Review`, `Done`).
4. Create tasks, assign owners, set priorities/due dates, and organize with labels & subtasks.
5. Drag-and-drop (or keyboard-move) tasks across columns with instant optimistic UI and real-time WebSocket updates for teammates.
6. Collaborate via comments, receive targeted notifications, and inspect delivery metrics in Analytics.

## Non-Goals (Out of Scope for MVP)
- Microservices or Kubernetes orchestration (modular monolith first).
- Gantt charts, time-tracking, or billing/subscriptions.
- Rich-text WYSIWYG collaborative document editing (CRDTs).

## Success Criteria
- Zero cross-tenant data leakage (404 on every cross-org resource lookup, verified by automated tests).
- Constant SQL query count on board loading regardless of task count (no N+1 queries).
- Optimistic task movement with deterministic fractional ordering and automatic rollback on failure.
- End-to-end CI pipeline (lint, type-check, Postgres integration tests, Vitest, Playwright, Docker build).

