# Service Robustness Tasks — notification

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.** (In this project's sessions the skill is not registered by name; the user has authorized reading it from `.agents/skills/tlc-spec-driven/` by path.)

---

**Design**: `.specs/features/service-robustness/design.md`
**Status**: Draft

---

## Test Coverage Matrix

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Consumer + settle helper | unit | Every class of invalid payload; the `catch` never throws; a `SyntaxError` is transient | `src/notifications/infrastructure/messaging/*.spec.ts` | `npm test` |
| Real broker | integration | `data: null` reaches the DLQ on its first delivery; the suite fails in CI without a broker | `test/*.e2e-spec.ts` | `RABBITMQ_TEST_URL=… npm run test:e2e` |

## Gate Check Commands

> The e2e suite needs RabbitMQ and PostgreSQL; see the gate notes in `catalog-messaging-hardening/tasks.md`. The new broker suite needs a broker loaded with the platform's definitions.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Unit-only tasks | `npm test` |
| Full | e2e tasks | `npm test && npm run test:e2e` |
| Build | Last task | `npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build` |

---

## Execution Plan

### Phase 1

```
T1 -> T2
```

---

## Task Breakdown

### T1: Validate the envelope and never throw from the catch

**What**: Add `parseEnvelope`, make the `catch` safe, and narrow `isPermanentFailure` to `InvalidTerminalEventError`.
**Where**: `src/notifications/infrastructure/messaging/terminal-event.consumer.ts` (+ `settle-failed-message.ts`)
**Depends on**: None
**Reuses**: `InvalidTerminalEventError`
**Requirement**: ROB-04, ROB-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Unit: `data: null`, missing, `[]`, `"x"`, `1` and `{}` each get `nack(false)` immediately, with no throw. The `null` case is seen red first
- [x] Unit: a `SyntaxError` thrown by the repository gets `nack(true)` after the backoff; `not json` gets `nack(false)`
- [x] Putting `event.eventId` back in the `catch` fails the null test
- [x] Quick gate passes

**Tests**: unit
**Gate**: quick

**Status**: ✅ Complete. Seen red first: `null` and missing rejected with `TypeError ... reading 'eventId'` from the `catch`; the delivery-side `SyntaxError` was nacked at once. Negative: an unguarded `event.eventId` in the `catch` fails the `null` and missing cases. Quick gate: 79 passed (was 71). Two existing assertions in `settle-failed-message.spec.ts` changed as ROB-05 requires: a bare `SyntaxError` is now transient, and the not-JSON case is `InvalidTerminalEventError('Body is not JSON', 'MALFORMED_JSON')`. `MALFORMED_JSON` and `INVALID_PAYLOAD` were added to the closed code union.

---

### T2: Prove the dead-lettering on a real broker

**What**: A new broker e2e suite, `test/broker.e2e-spec.ts`: a `data: null` message reaches `notification.terminal.dlq` on its first delivery. The CI e2e job gains a broker loaded with the platform's definitions, as in the Worker's CI.
**Where**: `test/broker.e2e-spec.ts` (+ `.github/workflows/ci.yml`)
**Depends on**: T1
**Reuses**: `processing-worker/test/broker.e2e-spec.ts` and its CI step
**Requirement**: ROB-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Locally, against a broker loaded with the definitions: one message in the DLQ, with `x-death` showing rejected/1
- [x] With T1's change reverted (the old `catch`), the message stays unacked and the test fails
- [x] With `CI=true` and no URL, the suite fails
- [x] The workflow parses
- [x] Build gate passes

**Tests**: integration
**Gate**: build

**Status**: ✅ Complete. The suite passes against a dedicated broker loaded with `definitions.json`. Negatives: with the old `catch` the DLQ stays at 0 and the queue shows 1 unacked message, so the test fails; `CI=true` without the URL fails on `RABBITMQ_TEST_URL must be set in CI`. `yaml.safe_load` parses the workflow. The CI job extends its existing `rabbitmq` service (adds 15672), widens the platform sparse checkout to `db/init` and `rabbitmq`, imports the definitions with the Worker's retry loop, and sets `RABBITMQ_TEST_URL` on the e2e step. Build gate, run the CI way (one definitions-loaded broker on 5672 for every suite, PostgreSQL configured): lint, typecheck, 79 unit, 16 e2e with 0 skipped, build. Without the URL locally: 15 passed, 1 skipped.

---

## Phase Execution Map

```
Phase 1 (T1 T2)
```

2 tasks.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 consumer + 1 classifier | ⚠️ OK - cohesive |
| T2 | 1 suite + its CI step | ⚠️ OK - cohesive |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows (within phase) | Status |
| --- | --- | --- | --- |
| T1 | None | — | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Consumer + settle helper | unit | unit | ✅ OK |
| T2 | Real broker | integration | integration | ✅ OK |
