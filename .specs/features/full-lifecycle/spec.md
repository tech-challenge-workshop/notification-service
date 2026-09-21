# Notification Full Lifecycle Specification

## Problem Statement

The Notification Service already declares a terminal contract that anticipates failure: `TerminalEventDto` carries optional `zipStorageKey` and `failureReason`. But `DeliveryRecord` stores neither, so the reason a request failed is discarded the moment it arrives. When S7 renders the failure email, there will be nothing to render.

The service also accepts terminal events that cannot be acted on. It validates that `status` is `COMPLETED` or `FAILED`, and nothing more: a `COMPLETED` event with no `zipStorageKey`, or a `FAILED` event with no `failureReason`, is recorded as a successful delivery and the defect surfaces later as an empty email.

## Goals

- [ ] Retain the outcome detail each terminal event carries, so a later email can describe it.
- [ ] Reject a terminal event whose payload contradicts its own status.
- [ ] Keep one delivery record per `eventId`, unchanged under redelivery.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Sending email over SMTP, and message templates | Owned by S7. This slice makes the content available; it does not deliver it. |
| Durable persistence of delivery records | Owned by S3. The in-memory repository stays as-is here. |
| Retrying a failed notification | The foundation fixes one attempt per terminal event. |
| Changing `ProcessingRequest` state | The Catalog owns every transition; this service only observes terminal outcomes. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here - nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| What the record retains | The outcome detail that applies to the status: the storage key for a success, the reason for a failure | S7 renders from the record, not from a replayed event, so anything discarded now is unavailable then. | y |
| Payload consistency | A terminal event must carry exactly the detail its status implies | Recording an inconsistent event defers the defect to the moment an email is sent, which is the worst place to discover it. | y |
| Handling of an inconsistent event | Rejected without requeue, like other contract violations today | Redelivering a malformed payload cannot make it valid; the existing consumer already treats contract errors this way. | y |
| Trust in `failureReason` | Consumed as already safe | The Catalog owns the mapping from failure code to user-facing text and is the only publisher of terminal events. | y |
| Persistence in this slice | The existing in-memory repository | S3 replaces it. Settling the record shape first avoids migrating a schema that is about to change. | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Retain the outcome of every terminal event ⭐ MVP

**User Story**: As the owner of a request, I want the service to keep why my video failed so that the notification I eventually receive can tell me.

**Why P1**: Without it, the failure path reaches this service and is silently discarded, which defeats the requirement the whole slice exists to satisfy.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN a `COMPLETED` terminal event is consumed THEN the service SHALL record the delivery together with its `zipStorageKey`. <!-- event-driven -->
2. WHEN a `FAILED` terminal event is consumed THEN the service SHALL record the delivery together with its `failureReason`. <!-- event-driven -->
3. WHEN a delivery is recorded THEN it SHALL retain the `ownerUserId` and the `processingRequestId` the event carried. <!-- event-driven -->
4. IF the same `eventId` is consumed again THEN the service SHALL return the existing record and SHALL NOT create or modify a second one. <!-- unwanted-behavior -->

**Independent Test**: Consume one completed and one failed event, assert the stored fields of each, then replay both and assert the record count and contents are unchanged.

---

### P2: Reject a terminal event that contradicts itself

**User Story**: As a maintainer, I want an inconsistent terminal event refused on arrival so that the defect surfaces at its source instead of as an empty email.

**Why P2**: The service is useful without it, but it would store records that cannot be rendered.

**Acceptance Criteria**:

1. IF a `COMPLETED` event carries no `zipStorageKey` THEN the service SHALL reject it and SHALL record no delivery. <!-- unwanted-behavior -->
2. IF a `FAILED` event carries no `failureReason` THEN the service SHALL reject it and SHALL record no delivery. <!-- unwanted-behavior -->
3. IF a terminal event carries both `zipStorageKey` and `failureReason` THEN the service SHALL reject it, because the outcome is ambiguous. <!-- unwanted-behavior -->
4. WHEN the service rejects an event for a contract violation THEN it SHALL NOT requeue the message. <!-- event-driven -->
5. WHEN the service rejects an event THEN it SHALL log the violation with the `eventId` and the reason. <!-- event-driven -->

**Independent Test**: Consume each malformed shape and assert that no record was created and that the message was not requeued.

---

## Edge Cases

- IF a terminal event carries a `status` outside `COMPLETED` and `FAILED` THEN the service SHALL reject it, as it does today.
- IF persisting a delivery fails for a technical reason THEN the service SHALL requeue the message, because a retry can succeed where a contract violation cannot.
- WHEN a `FAILED` event carries a `failureReason` that is present but empty THEN it SHALL be treated as absent.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| LC-01 | P1: Retain the outcome | Design | Pending |
| LC-02 | P1: Retain the outcome | Design | Pending |
| LC-03 | P1: Retain the outcome | Design | Pending |
| LC-04 | P1: Retain the outcome | Design | Pending |
| LC-05 | P2: Reject inconsistency | Design | Pending |
| LC-06 | P2: Reject inconsistency | Design | Pending |
| LC-07 | P2: Reject inconsistency | Design | Pending |
| LC-08 | P2: Reject inconsistency | Design | Pending |
| LC-09 | P2: Reject inconsistency | Design | Pending |

**ID format:** `LC-[NUMBER]`

**Coverage:** 9 total, 0 mapped to tasks, 9 unmapped (mapping happens in Tasks).

---

## Success Criteria

- [ ] A failed request's reason survives in the delivery record and is available to S7.
- [ ] Every inconsistent terminal event is refused, with nothing recorded.
- [ ] Replaying the whole suite leaves the record count and contents unchanged.
