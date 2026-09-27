# Email Notification — Notification Service Specification

## Problem Statement

`DeliveryRecord` already captures the terminal outcome and dedups by `eventId` — durably, across restarts, since the durable-persistence slice. Nothing is ever sent. RF-5 stops at "recorded" and never reaches the user, which is the whole point of the requirement.

## Goals

- [ ] Send exactly one email per terminal event, success or failure template matching the event's status.
- [ ] Record a delivery failure without touching `ProcessingRequest` state and without retrying automatically.
- [ ] Survive a crash between persisting the delivery record and sending the email, without either sending twice or losing the attempt forever.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Automatic retry of a failed send | The foundation fixes one attempt per terminal event; email inherits the same rule. |
| Any channel other than email | Not asked for. |
| Resolving or validating the recipient address | It arrives already resolved on the event, by AD-015; this service only uses it. |
| A templating engine or library | Two templates, three interpolated fields each — a dependency for that is heavier than the problem. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here - nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| SMTP client | `nodemailer` | Node has no built-in SMTP client; this is the de facto standard, and the only new runtime dependency this slice adds | y |
| SMTP config | `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` env vars, no auth | Mailpit needs none locally; the same three variables are what change to point at a real provider later, matching AD-005's "host and credential" portability claim | y |
| Template shape | Plain functions returning `{ subject, text }` | No HTML needed for a hackathon demo Mailpit renders as plain text fine; a function per status is the whole "template engine" this needs | y |
| The one-attempt gate | Keyed on the `DeliveryRecord`'s own `emailSentAt`/`emailError` fields, not on "row just created vs. already existed" | A crash between saving the record and sending the email must not permanently lose the attempt on redelivery, and must not double-send once the attempt has actually completed; gating on the record's own outcome fields (rather than on new-vs-existing) covers the crash window that the simpler check would miss | y |
| What a failed send stores | A bounded, safe string (error name/message), never the raw transport error | A raw SMTP error can carry connection or credential detail that has no business sitting in a delivery table | y |
| SMTP send timeout | A bounded connection/socket timeout on the `nodemailer` transport | An unbounded call would let a stuck SMTP connection hold the consumer, and the whole broker topology, hostage | y |

**Open questions:** none.

---

## User Stories

### P1: Send the matching email exactly once ⭐ MVP

**User Story**: As the request owner, I want an email when my video finishes or fails, so that I find out without polling the API.

**Why P1**: This is RF-5. Nothing else in the slice matters if this doesn't hold.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN a `COMPLETED` terminal event is recorded for the first time THEN the service SHALL send the success template to `ownerEmail`. <!-- event-driven -->
2. WHEN a `FAILED` terminal event is recorded for the first time THEN the service SHALL send the failure template, containing only the safe `failureReason` and the `processingRequestId`, to `ownerEmail`. <!-- event-driven -->
3. IF the same `eventId` is redelivered after an email attempt already completed (sent or failed) THEN the service SHALL NOT attempt to send again. <!-- unwanted-behavior -->
4. WHEN a previously recorded delivery has neither `emailSentAt` nor `emailError` set (an attempt that never completed, e.g. a crash between saving and sending) THEN a redelivery of that `eventId` SHALL still attempt exactly one send. <!-- event-driven -->
5. The failure email SHALL NOT contain any field other than the safe `failureReason` and the identifiers already safe to expose. <!-- ubiquitous -->

**Independent Test**: Publish a `FAILED` terminal event, assert one email with the exact safe sentence; republish the same `eventId`, assert still exactly one email sent in total; kill the process after the record is saved but before the send call (a test double that throws once, simulating the crash window), redeliver, assert exactly one send eventually happens.

---

### P2: Record failures without affecting processing state or retrying

**User Story**: As an operator, I want a failed send to be visible and inert, so that it doesn't silently vanish or corrupt the video's own state.

**Why P2**: Depends on P1's send path existing to fail.

**Acceptance Criteria**:

1. IF the SMTP send fails THEN the service SHALL persist `emailError` on the `DeliveryRecord` and SHALL NOT retry it automatically. <!-- unwanted-behavior -->
2. Recording an email outcome, successful or not, SHALL NOT call anything capable of changing `ProcessingRequest` state — this service holds no such capability by construction. <!-- ubiquitous -->
3. WHEN an email send fails THEN the terminal event's message SHALL still be acknowledged, exactly as when it succeeds. <!-- event-driven -->
4. WHEN an SMTP send does not complete within a bounded timeout THEN it SHALL be treated as a failure rather than blocking the consumer indefinitely. <!-- event-driven -->
5. `emailError` SHALL be a bounded, safe message and SHALL NOT contain the raw transport error or any credential/connection string. <!-- ubiquitous -->
6. WHEN migrations are applied to an existing `delivery_record` table THEN they SHALL add the two new nullable columns without data loss. <!-- event-driven -->

**Independent Test**: Point `SMTP_HOST` at nothing listening, publish a terminal event, assert `emailError` is set, the message is acked (no redelivery loop), and `ProcessingRequest`'s state (observed via the Catalog, in an integration/smoke context) is unaffected.

---

## Edge Cases

- IF the send succeeds but the subsequent persistence of `emailSentAt` fails (a database blip right after a successful send) THEN the message is nacked and requeued by the existing technical-fault path, and a redelivery will send a second email — a known, accepted residual risk (see design doc), not solved here because doing so would need a distributed transaction for a failure mode with no observed occurrence.
- WHEN the success and failure templates are rendered THEN both SHALL include `processingRequestId`, so an operator (and the platform's smoke test) can correlate a specific email to a specific request without any other lookup.
- IF `ownerEmail` on the event is missing or blank (should not happen once the upstream slices are in place, but the event is external input) THEN the service SHALL treat it as a contract violation, the same as a missing `processingRequestId` today, and SHALL NOT attempt a send.

---

## Requirement Traceability

`EN-` is shared across this feature: `fiap-x-api` owns `EN-01` to `EN-05`, `processing-catalog` owns `EN-06` to `EN-10`, this service owns `EN-11` to `EN-21`, `fiap-x-platform` owns `EN-22` to `EN-26`.

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| EN-11 | P1: Send exactly once | Design | Pending |
| EN-12 | P1: Send exactly once | Design | Pending |
| EN-13 | P1: Send exactly once | Design | Pending |
| EN-14 | P1: Send exactly once | Design | Pending |
| EN-15 | P1: Send exactly once | Design | Pending |
| EN-16 | P2: Failures recorded, not retried | Design | Pending |
| EN-17 | P2: Failures recorded, not retried | Design | Pending |
| EN-18 | P2: Failures recorded, not retried | Design | Pending |
| EN-19 | P2: Failures recorded, not retried | Design | Pending |
| EN-20 | P2: Failures recorded, not retried | Design | Pending |
| EN-21 | P2: Failures recorded, not retried | Design | Pending |

**ID format:** `EN-[NUMBER]`

**Coverage:** 11 total, 0 mapped to tasks, 11 unmapped (mapping happens in Tasks).

---

## Success Criteria

- [ ] A `FAILED` terminal event produces exactly one email, visible in Mailpit, carrying only the safe sentence.
- [ ] A `COMPLETED` terminal event produces exactly one success email.
- [ ] Redelivering the same `eventId`, whether after a completed attempt or a simulated crash, never produces two emails and never loses the one attempt owed.
- [ ] A send failure is recorded, is inert to `ProcessingRequest` state, and does not retry.
