# DevFlow — Design System & Motion Spec

Direction (from roadmap): **calm, professional SaaS workspace** — neutral surfaces, crisp type, *one* confident accent, restrained status colours. Our signature that makes it memorable: **"Volt"** — an electric-lime accent on deep graphite ink, plus a motion language built around the idea of *flow* (things glide into place, never bounce around for decoration).

## 1. Tokens (CSS variables, both themes; dark is default)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#09090B` | `#FAFAF9` | app background |
| `--surface` | `#111114` | `#FFFFFF` | cards, sidebar |
| `--elevated` | `#18181C` | `#FFFFFF` | popovers, drawer |
| `--muted-bg` | `#1F1F24` | `#F4F4F5` | inputs, hover rows |
| `--border` | `rgba(255,255,255,.08)` | `rgba(9,9,11,.08)` | hairlines |
| `--border-strong` | `rgba(255,255,255,.14)` | `rgba(9,9,11,.16)` | focus-adjacent |
| `--text` | `#EDEDEF` | `#0A0A0B` | body |
| `--text-muted` | `#8E8E98` | `#62626B` | secondary (≥4.5:1 on bg) |
| `--accent` | `#C6F432` (Volt) | `#C6F432` (fills) | primary buttons, active indicators |
| `--accent-fg` | `#0A0A0B` | `#0A0A0B` | text on accent |
| `--accent-text` | `#D4FA5A` | `#4D7C0F` | accent-coloured text/links (contrast-safe) |
| `--success` | `#10B981` | `#059669` | |
| `--warning` | `#F59E0B` | `#B45309` | |
| `--danger` | `#F43F5E` | `#E11D48` | |
| `--info` | `#38BDF8` | `#0284C7` | |

Priority colours: urgent `#F43F5E`, high `#FB923C`, medium `#FACC15`, low `#38BDF8`, none `#71717A` (always paired with an icon/label — never colour alone).

* Spacing scale 4/8/12/16/24/32/48/64 px (Tailwind defaults). Radius: `sm 6px`, `md 10px`, `lg 14px`, `xl 20px`, pill `999px`.
* Type: **Space Grotesk Variable** (display / headings, tight tracking `-0.02em`), **Inter Variable** (UI, 14px base in app, 16px marketing), **JetBrains Mono Variable** (task keys `WEB-12`, `kbd`, code). Type scale 12/13/14/16/18/22/28/36/48/64/88.
* Elevation: hairline border + soft shadow `0 1px 0 rgba(255,255,255,.04) inset, 0 8px 24px -12px rgba(0,0,0,.6)`; popovers add a 1px inner highlight. Subtle film-grain noise overlay (SVG, 3–4% opacity) on marketing + auth backgrounds only.
* Focus: `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible` everywhere.

## 2. Motion language (Motion for React)

| Interaction | Duration / spring | Notes |
|---|---|---|
| Hover / press feedback | 120–160 ms | `scale(.97)` on press; colour/opacity only on hover |
| Menus, popovers, tooltips | 180–220 ms | fade + 4px y + scale .98 → 1, origin-aware |
| Dialogs / drawer | 240–280 ms | drawer slides from right (x: 24 → 0) + overlay fade |
| Page transitions | 280–340 ms | fade + 8px y, `mode="wait"` only for content area, not shell |
| Layout (card reorder, list insert/remove) | spring `{stiffness: 500, damping: 38, mass: .8}` | `layout` + `AnimatePresence` |
| Signature ease | `cubic-bezier(.22, 1, .36, 1)` ("flow") | for all tweens |

* **Shared-element indicators** via `layoutId`: sidebar active pill, tab underline, segmented controls, view toggles.
* Drag: overlay card lifts (scale 1.03, rotate 2°, larger shadow, accent ring); destination column glows faintly; drop settles with spring.
* Realtime: card changed by someone else gets a 1.2 s accent ring "flash" + the actor's avatar chip briefly.
* Number count-up for KPI cards (only on first view). Charts animate in once.
* Skeleton shimmer is **subtle** (gradient sweep 1.6 s, low contrast).
* `prefers-reduced-motion` **and** an in-app "Reduce motion" toggle (Settings → Profile) → `MotionConfig reducedMotion="always"`, disable flow-field canvas, marquee, tilt, shimmer.
* Never delay a critical action for an animation; no scroll-jacking; no constant pulsing (presence dot pulses at most once on change).

## 3. Signature marketing moments (landing page `/`)
1. **Hero** — kinetic headline "Work that *flows*." (per-word masked rise, 60 ms stagger), sub-copy, two CTAs (magnetic primary button). Background: a lightweight `<canvas>` **flow-field** of thin drifting lines tinted with Volt at low opacity, cursor spotlight radial gradient, grain overlay. Paused when tab hidden / off-screen; static in reduced motion.
2. **Live product preview** — a perspective-tilted app window (tilts ≤ 6° toward pointer) containing a *real* mini Kanban built from the app's card component: cards auto-glide between columns every ~2.4 s via layout animation, with two simulated collaborator cursors ("Priya", "Alex") that glide to a card, "grab" it, and drop it. Presence avatars in the window's top bar.
3. **Proof strip** — infinite marquee of stack badges (FastAPI, PostgreSQL, React, TypeScript, WebSockets, Redis, Docker, Playwright).
4. **Bento features grid** — 6 tiles each with its own micro-animation on hover/in-view: realtime (two avatars + event pulses), permissions (role matrix ticks), analytics (sparkline draws), command palette (typing animation), activity feed (items slide in), keyboard-first (kbd keys depress).
5. **"How it flows"** — 4 steps (Create workspace → Invite → Plan → Ship) with a scroll-linked progress line (`useScroll`, *not* scroll-jacking).
6. **Engineering section** (recruiter-facing) — architecture diagram card + key facts (tenant isolation, optimistic UI with rollback, JWT rotation, constant-query board loading).
7. **CTA + footer** — "Try the live demo" logs in with the seeded demo account.

## 4. App screens
Login/Register/Forgot/Reset (split layout: form left, animated brand panel right) · Onboarding (create workspace stepper + pending invitations) · Workspace dashboard · Projects (grid/list, filters, pagination, archived tab) · **Board** · Task drawer · Task list/table view · Activity feed · Notifications (popover + page) · Analytics · Settings (profile, security, notifications, workspace, members & invitations, labels) · Project settings (columns, members, archive/delete) · Invite accept · 404 · permission-denied · offline banner · error boundary.

App shell: fixed collapsible sidebar (workspace switcher, nav, projects list, user menu), compact top bar (breadcrumbs, ⌘K search trigger, presence avatars, notifications bell, theme toggle), content area with page title + primary action.

## 5. Accessibility checklist
Semantic landmarks · every icon button has `aria-label` · Radix primitives give focus traps + `Esc` · keyboard alternative to drag: card "Move to…" menu (column + position) and `Alt+←/→` / `Alt+↑/↓` on a focused card · `aria-live="polite"` region for save status and board moves · visible focus · usable at 200 % zoom · WCAG AA contrast in both themes.

