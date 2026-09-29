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

### L-003 - Prove log-line content through the app's real logger wiring (shared context store and bootstrap logger), not only on a logger the test builds itself
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `logging` · harmful: 0
- features: observability
- evidence: M11 src/main.ts:12 (M10 observability.module.ts:13 killed) (logging)
- last seen: 2026-09-29T02:29:19Z

### L-004 - Key-path log redaction does not cover values interpolated into message strings; keep secrets out of error messages and assert on a real log call site
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `logging` · harmful: 0
- features: observability
- evidence: OBS-49; src/notifications/application/notification-delivery.service.ts:157 (probe B) (logging)
- last seen: 2026-09-29T02:29:19Z

### L-005 - When a spec names a log field, also pin its format (e.g. ISO string vs epoch number) and its value outside any correlation scope
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `logging` · harmful: 0
- features: observability
- evidence: OBS-48 precision flag 1; src/observability/logger.config.ts:62 (logging)
- last seen: 2026-09-29T02:29:19Z

### L-006 - Name metric label values by the measured event (send outcome) rather than by the input's domain status, so independent tests cannot conflate the two
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `metrics` · harmful: 0
- features: observability
- evidence: P2 independent test precision flag 2; test/observability.e2e-spec.ts:251 (metrics)
- last seen: 2026-09-29T02:29:19Z

### L-007 - Keep the entrypoint a single call into a tested composition function, and prove that call with a process-level smoke or a mocked-factory spec
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `bootstrap` · harmful: 0
- features: observability
- evidence: M14 src/main.ts:10 (bootstrap)
- last seen: 2026-09-29T02:52:18Z

### L-008 - When a guard narrows an untrusted error property by type, add a test case with the rejected type so the guard cannot be loosened unnoticed
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `logging` · harmful: 0
- features: observability
- evidence: M20 src/notifications/application/notification-delivery.service.ts:159 (logging)
- last seen: 2026-09-29T02:52:18Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
