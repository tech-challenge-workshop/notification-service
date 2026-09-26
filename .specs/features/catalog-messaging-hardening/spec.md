# Catalog Messaging Hardening Specification — notification

## Problem Statement

The Notification service handles a failed terminal event in two ways. An invalid event is rejected to the DLQ. **Anything else is requeued at once, with no pause.** RabbitMQ 4 does not count an explicit requeue against a quorum queue's delivery limit, so while PostgreSQL is away every in-flight message spins in a hot loop. AD-012 forbids this; the Catalog and the Worker already pause before a requeue. A body that is not JSON should also be dead-lettered rather than retried.

## Goals

- [ ] A transient failure is retried after a pause, never in a hot loop
- [ ] A message that can never succeed goes to the DLQ on its first delivery

## Out of Scope

| Feature | Reason |
| --- | --- |
| Email sending | S7 |
| Catalog and Worker items | Their own spec files in this feature (see `processing-catalog/.specs/features/catalog-messaging-hardening/context.md`) |

---

## Assumptions & Open Questions

Decisions of 2026-09-26 are in `processing-catalog/.specs/features/catalog-messaging-hardening/context.md`.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Pause length | `RABBITMQ_RETRY_BACKOFF_MS`, default 1000 ms; blank, whitespace, negative or non-numeric → 1000; `0` → 0 | Same variable and parsing as the Catalog (MSG-06) and the Worker (AD-012) | y |
| What is permanent | `InvalidTerminalEventError` (as today) and a body that is not JSON | AD-012's classification | y |
| Where the pause happens | Before the requeue, per message | Same shape as the Catalog's `settleFailedMessage` | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Transient failures pause before retrying ⭐ MVP

**User Story**: As the operator, I want a terminal event that fails for a transient reason to be retried after a pause, so that a database outage does not spin the service.

**Why P1**: AD-012; this is the one service still breaking it.

**Acceptance Criteria**:

1. IF handling a terminal event fails with any error other than a permanent one THEN the service SHALL wait `RABBITMQ_RETRY_BACKOFF_MS` and then requeue the message.
2. WHEN `RABBITMQ_RETRY_BACKOFF_MS` is unset, empty or only whitespace THEN the pause SHALL be 1000 ms.
3. WHEN it is `0` THEN the requeue SHALL happen without a pause.

**Independent Test**: With a repository that throws a persistence error and a fake clock, no requeue happens before 1000 ms, and one happens at 1000 ms.

---

### P2: Messages that can never succeed are dead-lettered ⭐ MVP

**User Story**: As the operator, I want a malformed message dead-lettered on its first delivery, so that it neither loops nor blocks the queue.

**Why P2**: AD-012's classification.

**Acceptance Criteria**:

1. IF the message body is not JSON THEN the service SHALL reject it without requeue on its first delivery.
2. IF the event is invalid (`InvalidTerminalEventError`) THEN the service SHALL still reject it without requeue.
3. WHEN a message is rejected without requeue THEN the service SHALL NOT wait the backoff.

**Independent Test**: A body `not json` is nacked with `requeue=false` immediately.

---

## Edge Cases

- WHEN the service shuts down during a pause THEN the message SHALL be left unacked, so the broker redelivers it.

---

## Requirement Traceability

`MSG-` is shared: `processing-catalog` owns `MSG-01` to `MSG-09`, this service `MSG-10` and `MSG-11`, `processing-worker` `MSG-12` to `MSG-15`.

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| MSG-10 | P1: Pause before requeue (AD-012) | - | Pending |
| MSG-11 | P2: Non-JSON and invalid events dead-lettered | - | Pending |

**ID format:** `[CATEGORY]-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 2 total, 0 mapped to tasks, 2 unmapped ⚠️ (mapped in Tasks)

---

## Success Criteria

- [ ] No requeue happens before the backoff has elapsed
- [ ] A non-JSON message reaches the DLQ on its first delivery

---

## Dependencies

None.
