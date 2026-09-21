# Full Lifecycle Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/full-lifecycle/design.md`
**Status**: Done

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/features/local-docker-integration/spec.md` (prior slice for this repository), `test/jest-e2e.json`, `package.json` scripts. No coverage threshold is configured anywhere in the repository.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain record | none | Build gate only - it declares shape and carries no behaviour | `src/notifications/domain/delivery-record.ts` | build gate only |
| Application service | unit | All branches; 1:1 to spec ACs; every listed edge case, including each inconsistent payload shape | `src/notifications/application/*.spec.ts` | `npm test` |
| Messaging consumer | unit | Valid event acked; contract violation nacked without requeue; technical fault nacked with requeue | `src/notifications/infrastructure/messaging/*.spec.ts` | `npm test` |
| Delivery flow | e2e | Both terminal statuses recorded with their detail, through the local integration route | `test/*.e2e-spec.ts` | `npm run test:e2e` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm test` |
| Full | After tasks touching the consumer or the e2e path | `npm test && npm run test:e2e` |
| Build | After phase completion | `npm run lint && npm test && npm run test:e2e && npm run build` |

**Note**: `npm run test:e2e` requires a broker at `amqp://localhost:5672`. Start one first: `docker run -d --rm -p 5672:5672 rabbitmq:4-management-alpine`.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Retain and validate the outcome

```
T1 → T2 → T3
```

### Phase 2: Transport behaviour and end-to-end

```
T4 → T5
```

---

## Task Breakdown

### T1: Widen the delivery record

**What**: Add optional `zipStorageKey` and `failureReason` to `DeliveryRecord`.
**Where**: `src/notifications/domain/delivery-record.ts`
**Depends on**: None
**Reuses**: The existing class shape
**Requirement**: LC-01, LC-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Both fields are optional and typed as strings
- [x] The existing repository and its tests compile unchanged
- [x] Quick gate passes: `npm test`

**Tests**: none
**Gate**: quick

---

### T2: Reject a terminal event that contradicts its status

**What**: Extend the guard in `recordDelivery` so a payload inconsistent with its own status is refused before deduplication runs.
**Where**: `src/notifications/application/notification-delivery.service.ts` (modify)
**Depends on**: T1
**Reuses**: `InvalidTerminalEventError` and its code argument; the existing status check becomes the first of four rules
**Requirement**: LC-05, LC-06, LC-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A `COMPLETED` event without `zipStorageKey` is refused with `MISSING_ZIP_STORAGE_KEY` and records nothing
- [x] A `FAILED` event without `failureReason` is refused with `MISSING_FAILURE_REASON` and records nothing
- [x] An event carrying both fields is refused with `AMBIGUOUS_TERMINAL_OUTCOME`
- [x] A `failureReason` that is present but empty or whitespace is treated as absent
- [x] Validation runs **before** the `findByEventId` lookup, asserted by a test in which an invalid event is not served from a prior record
- [x] The existing invalid-status behaviour is unchanged, with no assertion weakened
- [x] Quick gate passes: `npm test`

**Tests**: unit
**Gate**: quick

---

### T3: Retain the outcome detail on the record

**What**: Persist `zipStorageKey` for a completed event and `failureReason` for a failed one.
**Where**: `src/notifications/application/notification-delivery.service.ts` (modify)
**Depends on**: T2
**Reuses**: The existing `findByEventId` short-circuit, which stays the idempotency mechanism
**Requirement**: LC-01, LC-02, LC-03, LC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A completed event stores the `zipStorageKey` and leaves `failureReason` unset
- [x] A failed event stores the `failureReason` and leaves `zipStorageKey` unset
- [x] `ownerUserId` and `processingRequestId` are asserted on the stored record, by value
- [x] A duplicate `eventId` returns the existing record with its fields unmodified, asserted by value rather than by record count alone
- [x] Quick gate passes: `npm test`

**Tests**: unit
**Gate**: quick

---

### T4: Confirm the transport policy for each rejection

**What**: Cover in the consumer that each new contract violation is nacked without requeue while a persistence fault still requeues.
**Where**: `src/notifications/infrastructure/messaging/terminal-event.consumer.spec.ts` (modify)
**Depends on**: T3
**Reuses**: The consumer's existing error routing, which already separates the two cases
**Requirement**: LC-08, LC-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each of the three new violations is asserted to nack with `requeue` false
- [x] A `DeliveryPersistenceError` is asserted to nack with `requeue` true
- [x] The rejection is asserted to be logged with the `eventId` and the reason
- [x] Assertions target the nack arguments, not only that nack was called
- [x] Full gate passes with a broker running: `npm test && npm run test:e2e`

**Tests**: unit
**Gate**: full

---

### T5: Cover both terminal outcomes end to end

**What**: Extend the local integration suite to deliver a completed and a failed terminal event and assert the observable record for each.
**Where**: `test/local-integration.e2e-spec.ts` (modify)
**Depends on**: T4
**Reuses**: The existing broker setup and the local observation route behind `LOCAL_INTEGRATION`
**Requirement**: LC-01, LC-02, LC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A completed event produces a record carrying its `zipStorageKey`
- [x] A failed event produces a record carrying its `failureReason`
- [x] Redelivering both leaves the records unchanged, asserted by value
- [x] Build gate passes: `npm run lint && npm test && npm run test:e2e && npm run build`

**Tests**: e2e
**Gate**: build

**Commit**: `feat(lifecycle): retain the outcome of every terminal event`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T4 ------→ T5

Phase boundaries (the last task of a phase gates the first task of the next):
          T3 ------→ T4
```

Total: 5 tasks. This packs into a single batch, below the ~7-task worker budget, so Execute runs inline with no sub-agents dispatched.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Widen the record | 1 file | ✅ Granular |
| T2: Reject inconsistency | 1 guard | ✅ Granular |
| T3: Retain the detail | 1 mapping | ✅ Granular |
| T4: Transport policy coverage | 1 suite | ✅ Granular |
| T5: End-to-end coverage | 1 suite | ✅ Granular |

T2 and T3 modify the same file and were considered for merging. They stay separate because they are independently verifiable and fail for different reasons: one refuses bad input, the other keeps good input.

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | no inbound arrow | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 (phase boundary) | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |

No task depends on a task in a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Domain record | none | none | ✅ OK |
| T2 | Application service | unit | unit | ✅ OK |
| T3 | Application service | unit | unit | ✅ OK |
| T4 | Messaging consumer | unit | unit | ✅ OK |
| T5 | Delivery flow | e2e | e2e | ✅ OK |

T1 is the only `Tests: none`, matching the matrix for a declaration that carries no behaviour. Its fields are proven by T3, which asserts each stored value, and by T5, which reads them back through the observation route.

---

## Cross-repository ordering

This slice's strictness depends on a change landing in `processing-catalog` in the same slice: its `TerminalEventDto` must gain `failureReason` and make `zipStorageKey` optional.

Enabling T2 before that lands would start rejecting terminal events the Catalog still publishes in the old shape. Verify the Catalog's widened contract before merging this repository's change.

---

## Execution record

**Completed**: 2026-09-21 · merged in [#4](https://github.com/tech-challenge-workshop/notification-service/pull/4)

Final gate: lint, typecheck, 43 unit tests, 8 e2e against a real broker, build - all
green.

### Deviations

None. The five tasks executed as planned.

### Existing assertions updated

One test built a `FAILED` event by spreading a completed one, so it carried both a
storage key and a reason - exactly what LC-07 now refuses. It was corrected to carry
only the reason, and strengthened to assert both fields by value.

### Cross-repository ordering, as planned

This repository's strictness depends on the Catalog widening `TerminalEventDto`. The
pull request body carried that note, and the Catalog merged first.
