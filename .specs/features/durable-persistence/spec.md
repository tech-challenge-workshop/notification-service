# Notification Durable Persistence Specification

## Problem Statement

The delivery record is the only thing standing between a terminal event and a duplicate notification, and it lives in memory. A restart erases it, so a redelivered event is treated as new — harmless today, because nothing is sent, and a double email the moment S7 lands.

S7 also renders from this record rather than from a replayed message. A record that does not survive a restart is a notification that cannot be reconstructed.

## Goals

- [ ] Keep one delivery record per `eventId`, across restarts and across replicas.
- [ ] Persist the outcome detail S7 will render.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Sending email and message templates | Owned by S7. This slice makes the record durable; it does not deliver anything. |
| Retrying a failed notification | The foundation fixes one attempt per terminal event. |
| Sharing tables with another service | The foundation forbids it: this service owns its delivery record and nothing else. |
| Changing `ProcessingRequest` state | The Catalog owns every transition. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here - nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Database | Its own PostgreSQL schema, not shared with the Catalog | The foundation forbids shared tables; a delivery record is this service's fact, not the Catalog's. | y |
| Repository port shape | Already asynchronous | Unlike the Catalog's, this port returns promises today, so the swap is an adapter change with no ripple through callers. | y |
| Uniqueness | `eventId` is the primary key | It is the deduplication key the service already relies on; making it the key moves the guarantee from application code into the schema. | y |
| Concurrent duplicate | Resolved by the uniqueness constraint and treated as already delivered | Two replicas consuming the same redelivered event must produce one record, and the loser must not fail the message. | y |
| Test strategy | The in-memory repository stays for unit tests; PostgreSQL is exercised by integration tests | Keeps the fast suite fast while proving the adapter against a real database. | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Keep the delivery record across restarts ⭐ MVP

**User Story**: As the owner of a request, I want the service to remember it already notified me, so that a redelivery after a restart does not notify me twice.

**Why P1**: It is the guarantee S7 depends on, and the only one this service makes.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN a terminal event is recorded THEN the delivery SHALL be persisted in PostgreSQL before the message is acknowledged. <!-- event-driven -->
2. WHEN the service restarts THEN a previously recorded `eventId` SHALL still be found. <!-- event-driven -->
3. WHEN the same `eventId` is consumed again THEN the service SHALL return the existing record and SHALL write nothing. <!-- event-driven -->
4. WHEN a delivery is persisted THEN it SHALL retain the outcome detail its status implies, so a later notification can render it. <!-- event-driven -->
5. IF two replicas record the same `eventId` concurrently THEN exactly one row SHALL exist and neither message SHALL fail. <!-- unwanted-behavior -->
6. IF the database is unreachable THEN the service SHALL report itself not ready, and the message SHALL be requeued rather than acknowledged. <!-- unwanted-behavior -->

**Independent Test**: Record a completed and a failed delivery, restart the process, replay both events, and assert the row count and every stored field are unchanged.

---

### P2: Ship the schema as a deliverable

**User Story**: As an evaluator, I want this service's table created by a runnable migration, because the challenge asks for the database script.

**Why P2**: It is a deliverable, and it is small once P1 defines the shape.

**Acceptance Criteria**:

1. WHEN the migrations are applied to an empty database THEN they SHALL create the delivery table with `eventId` as its key. <!-- event-driven -->
2. WHEN migrations are applied twice THEN the second run SHALL make no change. <!-- event-driven -->

---

## Edge Cases

- IF a contract violation is rejected THEN no row SHALL be written, so an invalid event never becomes the cached answer for a later redelivery.
- IF persisting fails for a technical reason THEN the message SHALL be requeued, because a retry can succeed where a contract violation cannot.
- WHEN a record is read back THEN exactly one of its storage key and failure reason SHALL be present, matching what was stored.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| DP-01 | P1: Durable delivery record | Design | Pending |
| DP-02 | P1: Durable delivery record | Design | Pending |
| DP-03 | P1: Durable delivery record | Design | Pending |
| DP-04 | P1: Durable delivery record | Design | Pending |
| DP-05 | P1: Durable delivery record | Design | Pending |
| DP-06 | P1: Durable delivery record | Design | Pending |
| DP-07 | P2: Schema deliverable | - | Pending |
| DP-08 | P2: Schema deliverable | - | Pending |

**ID format:** `DP-[NUMBER]`

**Coverage:** 8 total, 0 mapped to tasks, 8 unmapped (mapping happens in Tasks).

---

## Success Criteria

- [ ] A recorded delivery survives a restart and absorbs its own redelivery.
- [ ] The outcome detail read back matches what was stored, for both terminal statuses.
- [ ] Applying the migrations to an empty database works twice in a row.
