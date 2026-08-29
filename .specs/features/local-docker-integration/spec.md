# Notification Local Docker Integration Specification

## Problem Statement

Notification currently records terminal events through an in-process consumer. It must consume Catalog's local terminal queue, classify invalid input with a typed error, and offer a local-only delivery observation used by the system smoke test.

## Goals

- [ ] Consume terminal RabbitMQ events with idempotent delivery recording.
- [ ] Separate invalid-domain input from technical failure with typed errors.
- [ ] Expose delivery evidence only in the local integration profile.

## Out of Scope

| Feature | Reason |
| --- | --- |
| SES/email transmission, API/Worker/Catalog lifecycle behavior, Compose file | owned elsewhere or deferred. |
| Persistent delivery storage/shared contracts | local in-memory integration only. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- |
| Local read route | enabled only with `LOCAL_INTEGRATION=true` | smoke test needs a deterministic delivery observation | y |
| Delivery mode | record only, no SES | email remains out of this slice | y |

**Open questions:** none.

## User Stories

### P1: Record terminal delivery from local RabbitMQ ⭐ MVP

**Acceptance Criteria**:

1. WHEN Notification receives a valid terminal event with status `COMPLETED`, THEN it SHALL acknowledge the RabbitMQ message and record one delivery with the same request ID and `COMPLETED` status. <!-- event-driven -->
2. WHEN the same terminal event ID is received again, THEN Notification SHALL retain one delivery record and SHALL not create a duplicate. <!-- event-driven -->
3. IF a terminal event lacks `processingRequestId` or has invalid terminal status, THEN Notification SHALL raise a typed domain error, reject the message, and create no delivery record. <!-- unwanted-behavior -->
4. IF delivery persistence has a technical failure, THEN Notification SHALL follow the technical failure path rather than classify it as invalid terminal input. <!-- unwanted-behavior -->
5. WHEN `LOCAL_INTEGRATION=true`, THEN Notification SHALL expose a read-only delivery lookup by processing request ID; IF the flag is absent, THEN it SHALL not expose that route. <!-- event-driven -->

**Independent Test**: Deliver valid, duplicate, invalid, and technical-failure messages through the local queue, then query the local route for the valid request.

### P2: Preserve local test hygiene

1. The Notification Service SHALL retain AppleDouble exclusions from lint/Jest without runtime change. <!-- ubiquitous -->
2. WHEN a local-integration task is completed, THEN its commit SHALL include implementation, tests, and task status together. <!-- event-driven -->

## Edge Cases

- IF RabbitMQ is unavailable, THEN Notification readiness SHALL be false.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| NOT-01 | P1 | Design | Done |
| NOT-02 | P1 | Design | Done |
| NOT-03 | P1 | Design | Done |
| NOT-04 | P1 | Design | Done |
| NOT-05 | P1 | Design | Pending |
| NOT-06 | P2 | Design | Done |
| NOT-07 | P2 | Design | Pending |

## Success Criteria

- [ ] Notification records one observable local delivery for the completed Compose flow without SES.
