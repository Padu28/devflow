# ADR-0004: Fractional Midpoint Task Ordering

## Context
Re-numbering every task in a column on every drag-and-drop creates unnecessary row writes and lock contention.

## Decision
Store `tasks.position` as a `float` (spaced by `1024.0`). On `POST /tasks/{id}/move`, lock the moved task and destination column rows (`with_for_update()`), compute the midpoint between neighbors, and rebalance the entire column only when the gap falls below `1e-6`.

## Consequences
- Normal drag-and-drop updates a single task row inside one transaction.
- Concurrent moves serialize cleanly on the locked column rows.

