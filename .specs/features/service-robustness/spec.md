# Service Robustness Specification — notification

## Problem Statement

Two gaps remain in how the Notification service settles a failed message.

- **V48, a message with `data: null` or no `data` is never settled.** It is a pre-existing gap the spec A Verifier found.
  1. The consumer reads `event.processingRequestId` on `null` and throws a `TypeError`.
  2. Its `catch` then reads `event.eventId` and throws again, before `settleFailedMessage` runs.
  3. On a real broker the message stayed unacked indefinitely and never reached the DLQ, and it got stuck again after every restart.
- **Every `SyntaxError` counts as permanent, wherever it is thrown.** A `SyntaxError` from inside `recordDelivery` would dead-letter a message that a retry could have delivered.

## Goals

- [ ] Every message that can never succeed reaches the DLQ on its first delivery
- [ ] Only a parse failure of the message body is classified as a malformed message

## Out of Scope

| Feature | Reason |
| --- | --- |
| Catalog and Worker items | Their own spec files (`processing-catalog/.specs/features/service-robustness/context.md`) |
| Email | S7 |

---

## Assumptions & Open Questions

Decisions of 2026-09-26 are in `processing-catalog/.specs/features/service-robustness/context.md`.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| What counts as an invalid event | Anything that is not an object with a non-blank string `processingRequestId`: `null`, a missing `data`, an array, a string or a number | The consumer cannot act on it, and a retry will not change it | y |
| How a body parse error is classified | The consumer turns its own parse error into `InvalidTerminalEventError` with code `MALFORMED_JSON`, and `isPermanentFailure` no longer treats a bare `SyntaxError` as permanent | Only the parse of the body is known to be a malformed message | y |
| Logs of an invalid event | Use `event?.eventId` and log `unknown` when absent | The log line must not throw | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Invalid envelopes are dead-lettered ⭐ MVP

**User Story**: As the operator, I want a terminal event with no usable payload rejected to the DLQ on its first delivery, so that it never sits unacked.

**Why P1**: V48 leaves a message unacked forever, on every restart.

**Acceptance Criteria**:

1. IF the event payload is `null`, missing, an array, a string or a number THEN the service SHALL reject it without requeue on its first delivery.
2. WHEN such an event is rejected THEN the service SHALL log it without throwing, and SHALL NOT wait the backoff.
3. The `catch` path SHALL NOT dereference a payload it has not validated.

**Independent Test**: On a real broker, a message `{"pattern":"terminal.event","data":null}` reaches `notification.terminal.dlq` on its first delivery.

---

### P2: Only a body parse error is malformed

**User Story**: As the operator, I want a `SyntaxError` thrown during delivery treated as transient, so that a bug in persistence is retried, not dead-lettered.

**Why P2**: Today any `SyntaxError` dead-letters.

**Acceptance Criteria**:

1. WHEN the message body is not JSON THEN the service SHALL reject it without requeue, as today.
2. IF a `SyntaxError` is thrown by the delivery itself THEN the service SHALL requeue the message after the backoff.

**Independent Test**: A repository that throws `new SyntaxError('x')` leads to `nack(requeue=true)` after the backoff.

---

## Edge Cases

- WHEN the payload is `{}` THEN it SHALL be rejected as missing `processingRequestId`, as today.

---

## Requirement Traceability

`ROB-` is shared: `processing-catalog` owns `ROB-01` to `ROB-03`, this service `ROB-04` and `ROB-05`, and `processing-worker` `ROB-06` to `ROB-09`.

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| ROB-04 | P1: Invalid envelopes dead-lettered (V48) | Tasks | In Tasks |
| ROB-05 | P2: Only a body parse error is malformed (V48) | Tasks | In Tasks |

**ID format:** `[CATEGORY]-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 2 total, 2 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] `data: null` reaches the DLQ on a real broker
- [ ] A delivery-side `SyntaxError` is retried

---

## Dependencies

None.
