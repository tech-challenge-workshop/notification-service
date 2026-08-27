# Notification Initial Vertical Slice Specification

## Problem Statement

The Notification Service must prove the final consumer boundary without integrating Amazon SES yet. It records a controlled terminal notification and prevents duplicate delivery records for repeated events.

## Goals

- [ ] Consume controlled terminal events.
- [ ] Record one delivery per terminal `eventId` without changing Processing Request state.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Amazon SES email sending | Added after terminal-event behavior is proven. |
| Processing Request transitions | Owned by Processing Catalog. |
| S3 ZIP download URLs | Owned by FIAP X API. |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Delivery record | Controlled in-memory record is allowed. | The first slice proves deduplication before persistence is added. | Yes |
| Terminal event | `COMPLETED` or `FAILED` carries `eventId`, `processingRequestId`, `ownerUserId`, and `status`. | It follows the approved foundation's terminal-event contract. | Yes |

**Open questions:** none - all resolved or logged above.

## User Stories

### P1: Record terminal notification

**User Story**: As a developer, I want the Notification Service to record one controlled delivery for each terminal event so that final-flow observability is proven before SES integration.

**Why P1**: It completes the first vertical slice while preserving notification ownership.

**Acceptance Criteria**:

1. WHEN the Notification Service receives a terminal event with status `COMPLETED` or `FAILED` THEN it SHALL create one delivery record containing that `eventId`, `processingRequestId`, `ownerUserId`, and status.
2. IF the Notification Service receives the same terminal `eventId` again THEN it SHALL not create a second delivery record.
3. IF a terminal event has a status other than `COMPLETED` or `FAILED` THEN the Notification Service SHALL reject it without creating a delivery record.
4. The Notification Service SHALL not send Amazon SES email or change Processing Request state in this slice.

**Independent Test**: Deliver valid, duplicate, and non-terminal events and assert the resulting delivery-record count.

## Edge Cases

- IF persisting a delivery record fails THEN the Notification Service SHALL leave the message unacknowledged for technical redelivery.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| NOT-01 | P1: Record terminal notification | Tasks | In Progress |
| NOT-02 | P1: Record terminal notification | Tasks | In Progress |
| NOT-03 | P1: Record terminal notification | Tasks | In Progress |
| NOT-04 | P1: Record terminal notification | Tasks | Pending |

**Coverage:** 4 total, 4 mapped to future tasks, 0 unmapped.

## Success Criteria

- [ ] One valid terminal event creates one local delivery record.
- [ ] Duplicate and non-terminal events create no extra record.
