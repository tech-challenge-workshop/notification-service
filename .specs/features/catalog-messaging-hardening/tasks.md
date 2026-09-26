# Catalog Messaging Hardening Tasks — notification

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.** (In this project's sessions the skill is not registered by name; the user has authorized reading it from `.agents/skills/tlc-spec-driven/` by path.)

---

**Design**: `.specs/features/catalog-messaging-hardening/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: none, so strong defaults apply.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Settle helper | unit | Backoff parsing for every input class; permanent → immediate `nack(false)`; transient → `nack(true)` only after the pause (fake timers) | `src/notifications/infrastructure/messaging/*.spec.ts` | `npm test` |
| Consumer | unit + e2e | A non-JSON body, an invalid event, a persistence error, and success; the existing e2e unchanged | `src/**/*.spec.ts`, `test/*.e2e-spec.ts` | both |

## Gate Check Commands

> Generated from codebase — confirm before Execute. The e2e suite needs a broker at `amqp://localhost:5672`, and PostgreSQL for the persistence suite. See the `durable-persistence` notes.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Unit-only tasks | `npm test` |
| Full | Consumer changes | `npm test && npm run test:e2e` |
| Build | Last task | `npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build` |

---

## Execution Plan

### Phase 1: Retry pause and dead-lettering

```
T1 -> T2
```

---

## Task Breakdown

### T1: A local settle helper with a pause

**What**: Add `settle-failed-message.ts` with three functions:

- `retryBackoffMs()`, with the same rules as the Catalog's MSG-06.
- `isPermanentFailure()`, true for `InvalidTerminalEventError` or a `SyntaxError`.
- `settleFailedMessage()`: a permanent failure is nacked at once with `nack(false)`; anything else waits the backoff, then `nack(true)`.

**Where**: `src/notifications/infrastructure/messaging/settle-failed-message.ts`
**Depends on**: None
**Reuses**: `processing-catalog/src/infrastructure/rabbitmq/settle-failed-message.ts` (AD-003: copy, do not share)
**Requirement**: MSG-10, MSG-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Parsing cases: `""`, `"  "` and unset → 1000; `"0"` → 0; `"250"` → 250; `"-1"` and `"abc"` → 1000
- [x] With fake timers, a transient error is not nacked at 999 ms and is nacked with `requeue=true` at 1000 ms
- [x] A permanent error is nacked with `requeue=false` without advancing the clock
- [x] Quick gate passes

**Tests**: unit
**Gate**: quick

**Status**: Done. Quick gate `npm test` 66/66 (was 50; +16 in `settle-failed-message.spec.ts`).

---

### T2: The consumer settles through the helper

**What**: `TerminalEventConsumer` parses the body inside `try`, and its `catch` calls `await settleFailedMessage(...)` in place of the three `nack` branches.

**Where**: `src/notifications/infrastructure/messaging/terminal-event.consumer.ts`
**Depends on**: T1
**Reuses**: The consumer's existing spec and the e2e suite
**Requirement**: MSG-10, MSG-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Unit:
  - `not json` → `nack(false)` at once, with no delivery recorded
  - invalid event → `nack(false)`
  - `DeliveryPersistenceError` → `nack(true)` only after the backoff
  - success → `ack`
- [x] Unit: closing during a pause leaves the message neither acked nor nacked, per the spec's edge case
- [x] Existing e2e green
- [x] Removing the pause, or treating `SyntaxError` as transient, turns a test red
- [x] Build gate passes

**Tests**: unit + e2e
**Gate**: build

**Status**: Done. Build gate green: lint=0, typecheck=0, `npm test` 71/71 (was 66; +5 in the consumer spec), `npm run test:e2e` 15/15 against PostgreSQL and RabbitMQ (0 skipped), build=0. Negatives: removing the pause turns 3 tests red; treating `SyntaxError` as transient turns 3 red; dropping the consumer parse turns the `not json` test red. Note: in the running composition Nest's ServerRMQ already nacks a non-JSON body with `requeue=false` before the handler (no pattern, so no handler); the consumer parse covers the handler path. A nack that throws because the channel closed during the pause is caught and logged, leaving the message unacked for redelivery.

---

## Phase Execution Map

```
Phase 1 (T1 T2)
```

2 tasks. Cross-repository order: `processing-catalog`, then this repository, then `processing-worker`.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 new module | ✅ Granular |
| T2 | 1 consumer | ✅ Granular |

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
| T1 | Settle helper | unit | unit | ✅ OK |
| T2 | Consumer | unit + e2e | unit + e2e | ✅ OK |
