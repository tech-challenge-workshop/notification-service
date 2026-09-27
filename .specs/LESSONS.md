# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - A consumer's catch block must not dereference the payload it failed to validate, or an error in the handler escapes the settle path and the message is never acked or dead-lettered.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `messaging` · harmful: 0
- features: catalog-messaging-hardening
- evidence: src/notifications/infrastructure/messaging/terminal-event.consumer.ts:34 (messaging)
- last seen: 2026-09-26T19:10:18Z

### L-002 - Every validation clause needs its own rejecting input; a clause no test isolates can be deleted with the suite green.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `messaging` · harmful: 0
- features: service-robustness
- evidence: src/notifications/infrastructure/messaging/terminal-event.consumer.ts:85 (messaging)
- last seen: 2026-09-27T01:07:35Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
