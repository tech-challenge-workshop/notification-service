## Validation: service-robustness (notification) — PASS with open items

**Spec-anchored check**: 7/7 ACs (ROB-04 AC1-3, ROB-05 AC1-2, the `{}` edge case, the independent broker test) matched the spec's outcome. 1 spec-precision note (the `{}` code is not asserted).
**Gate**: lint OK, typecheck OK, 79/79 unit, 16/16 e2e with 0 skipped (broker suite included), build OK.
**Sensor**: 11 mutations: 7 killed, 1 equivalent, 3 survived. None of the survivors breaks an AC.
**Report**: this file (scratchpad; the orchestrator copies it to `.specs/features/service-robustness/validation.md`).

# service-robustness (notification) Validation

**Date**: 2026-09-26
**Spec**: `notification-service/.specs/features/service-robustness/spec.md`
**Diff range**: `b9f6f55..7a4e7c2` (c57e6d4 T1, 7a4e7c2 T2), branch `fix/service-robustness`
**Verifier**: independent sub-agent (author ≠ verifier). This was the final round.

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 | ✅ Done | `parseEnvelope`, a `catch` that cannot throw, `isPermanentFailure` narrowed to `InvalidTerminalEventError` |
| T2 | ✅ Done | `test/broker.e2e-spec.ts`; CI broker loaded with the platform definitions |

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| ROB-04 AC1: a `null`, missing, array, string or number payload is rejected without requeue on first delivery | `nack(msg,false,false)` once, nothing recorded | `terminal-event.consumer.spec.ts:165-192`: `nack` `toHaveBeenCalledTimes(1)` and `toHaveBeenCalledWith(message,false,false)`; `recordDeliveryMock` `not.toHaveBeenCalled()` | ✅ |
| ROB-04 AC1, on a real broker (independent test) | `data:null` is in `notification.terminal.dlq` after its first delivery | `test/broker.e2e-spec.ts:98-123`: DLQ=1, QUEUE=0, body identical, `x-death` `{queue, reason:'rejected', count:1}`. Passed on a broker loaded with `definitions.json` | ✅ |
| ROB-04 AC1, other payload classes on a real broker | same | Verifier's own probe (scratch copy of the suite, since deleted). Missing, `[]`, `"x"`, `1`, `{}` and `{processingRequestId:'   '}` each reached the DLQ with `x-death` rejected/1. **6/6 passed** | ✅ |
| ROB-04 AC2: logged without throwing, no backoff | Handler resolves; nack happens with no timer advanced | `terminal-event.consumer.spec.ts:176-191`: `.resolves.toBeUndefined()` under fake timers with the clock never advanced; the log contains `unknown` | ✅ |
| ROB-04 AC3: the `catch` does not dereference an unvalidated payload | No throw from the `catch` | Both log lines use `event?.eventId ?? 'unknown'` (`terminal-event.consumer.ts:39,48`). The first is killed by the tests (M3, M9); the second is **untested** (M10 survived) | ✅ (partial coverage) |
| ROB-05 AC1: a body that is not JSON is rejected without requeue | `nack(false)` at once | `terminal-event.consumer.spec.ts:151-160`, unchanged; `settle-failed-message.spec.ts:74-79,138-141` with `MALFORMED_JSON` | ✅ |
| ROB-05 AC2: a delivery-side `SyntaxError` is requeued after the backoff | No nack at 999 ms, `nack(false,true)` at 1000 ms | `terminal-event.consumer.spec.ts:197-212`; `settle-failed-message.spec.ts:88`, `isPermanentFailure(SyntaxError)`=false | ✅ |
| Edge: `{}` rejected as missing `processingRequestId` | Rejected; the spec also names the code | `terminal-event.consumer.spec.ts:171`: rejected, but the code (`MISSING_PROCESSING_REQUEST_ID`) is not asserted | ⚠️ Spec-precision (minor) |

**V48** (`catalog-messaging-hardening/validation.md:53`, both `data:null` and a missing `data`): **closed.** `null` is covered by the committed broker suite. The missing-`data` case is covered by the unit tests and by the Verifier's broker probe; the committed suite does not include it.

**Status**: ✅ All ACs covered.

---

## Author's deviations — judgement

1. **`parseEnvelope` validates the payload Nest passes, not the parsed body's `data`: accepted.**
   - In `@nestjs/microservices` 11, `ServerRMQ.handleMessage` runs `JSON.parse(content)` (`server-rmq.js:165,248-252`), then `IncomingRequestDeserializer`, then `handler(packet.data)`.
   - No custom deserializer is configured (`src/messaging/rabbitmq.config.ts`), and `@Payload()` has no pipe. The payload is therefore exactly `JSON.parse(body).data`.
   - A non-JSON body, or a JSON primitive body, carries no `pattern`, so Nest treats it as external. It is then nacked with `requeue=false` for "no handler" before the handler runs. The consumer's own parse is defence in depth.
   - No mismatch can let an invalid event through. The residual risk is a future custom deserializer that remaps `data`; the second, unused `JSON.parse` would not catch that. This is a nit.
2. **A whitespace-only `processingRequestId` is rejected: accepted.** It matches the spec's confirmed assumption ("non-blank string"), and the broker probe showed it dead-lettered. It is **untested** in the committed tests (M6 survived); see Open items.
3. **CI changes: accepted.**
   - The `rabbitmq` service gains 15672, and the sparse checkout adds `rabbitmq`.
   - A 30×2 s import loop runs, and a final `curl -f` on `notification.terminal.dlq` fails the step if the import never succeeded.
   - `RABBITMQ_TEST_URL` is set on the e2e step. The YAML parses.
   - `origin/main` of fiap-x-platform has the same `rabbitmq/definitions.json` as the local checkout (`f225e2e`).
   - The other e2e suites also pass on the definitions-loaded broker (quorum default, delivery-limit 5): 16/16 locally.

## Changed existing tests — none weakened

- `settle-failed-message.spec.ts:74-79`: "not JSON is permanent" now uses `InvalidTerminalEventError(MALFORMED_JSON)` instead of a bare `SyntaxError`. ROB-05 requires this.
- `settle-failed-message.spec.ts:88`: a bare `SyntaxError` moved to the transient table. This inverts the old expectation, as ROB-05 requires.
- `settle-failed-message.spec.ts:138-141`: same substitution in the settle table. The assertion strength is unchanged (immediate `nack(false)`, no clock).
- `terminal-event.consumer.spec.ts`: additions only. The existing not-JSON test (`:151`) is unchanged and still passes through the new wrap. M4 and M8 show that it discriminates.

---

## Discrimination Sensor

Run in a scratch `git worktree` of 7a4e7c2, since removed. The real tree was never touched.

| # | File:line | Mutation | Suite | Killed? |
| --- | --- | --- | --- | --- |
| M1 | `settle-failed-message.ts:39` | `\|\| error instanceof SyntaxError` restored | unit | ✅ 2 failed |
| M2 | `terminal-event.consumer.ts:56` | Array accepted by `isObject` | unit | ➖ Equivalent: `[]` is still rejected, via `MISSING_PROCESSING_REQUEST_ID`, because a JSON array cannot carry a named property. Only the error code changes, and the spec does not fix it |
| M3 | `terminal-event.consumer.ts:39` | `event!.eventId` (unguarded) in the `catch` | unit + broker | ✅ 6 unit failed; the broker `data:null` test failed |
| M4 | `terminal-event.consumer.ts:72` | `MALFORMED_JSON` wrap removed (rethrow the `SyntaxError`) | unit | ✅ 1 failed (the not-JSON test hangs on the backoff) |
| M5 | `test/broker.e2e-spec.ts:16-22` | CI guard removed; `CI=true`, no URL | e2e + the CI skip check | ✅ With the guard: 1 failed. Without it, the suite goes green with 1 skipped, but the workflow's "Fail if any e2e test was skipped" step (`ci.yml:100`) exits 1. Killed at CI level |
| M6 | `terminal-event.consumer.ts:87` | `.trim()` removed (whitespace id accepted) | unit | ❌ Survived |
| M7 | `terminal-event.consumer.ts:85-88` | `typeof … !== 'string'` check replaced by `!processingRequestId` | unit | ❌ Survived (a numeric id is not tested) |
| M8 | `terminal-event.consumer.ts:69` | Body parse removed | unit | ✅ 1 failed |
| M9 | `terminal-event.consumer.ts:39` | `?? 'unknown'` removed | unit | ✅ 6 failed |
| M10 | `terminal-event.consumer.ts:48` | `event!.eventId` in the "Could not settle" warn | unit | ❌ Survived |
| M11 | `terminal-event.consumer.ts:56` | `value !== null` removed (null passes `isObject`) | unit + broker | ✅ 1 unit failed; the broker test failed |

**Sensor depth**: expanded (11 mutations).
**Result**: 7/10 non-equivalent mutants killed. All five suggested mutants were killed or equivalent (M1, M3, M4, M5 killed; M2 equivalent). The 3 survivors are recorded below as open items.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ (the second, unused `JSON.parse` is a small redundancy kept as defence in depth) |
| Surgical changes | ✅ |
| No scope creep | ✅ |
| Matches patterns | ✅ (the CI step mirrors the Worker's) |
| Spec-anchored outcome check | ✅ |
| Per-layer coverage expectation met | ✅ unit + broker |
| Every test maps to a spec requirement | ✅ |

---

## Edge Cases

- [x] `null`, missing, `[]`, `"x"`, `1`, `{}`: DLQ on first delivery (unit and real broker)
- [x] Whitespace-only `processingRequestId`: DLQ (probe only; no committed test)
- [ ] A structurally valid payload whose field types are wrong, e.g. `zipStorageKey: 1`. `notification-delivery.service.ts:33` calls `.trim()` on a number and throws a `TypeError`, which is transient. The message is requeued with backoff until the quorum delivery-limit (5) dead-letters it. It is **not** dead-lettered on its first delivery. This comes from code reading and was not run. It predates this change and is outside the ROB-04 AC list, but it goes against Goal 1 ("every message that can never succeed reaches the DLQ on its first delivery")
- [ ] Missing `eventId`: `findByEventId(undefined)` → TypeORM `where: { eventId: undefined }` (`typeorm-delivery.repository.ts:34-36`) drops the condition and can return an arbitrary existing row. The message is then acked as a "duplicate" with no record. This comes from code reading and was not run. It predates this change and is out of scope

---

## Gate Check

- **Gate command**: `npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build`, with `RABBITMQ_TEST_URL=amqp://guest:guest@localhost:5672` and `DATABASE_*` → PostgreSQL 17 with `fiap-x-platform/db/init`
- **Broker**: `rabbitmq:4-management-alpine` on host 5672, with `definitions.json` imported through the management API
- **Result**: lint 0 warnings; typecheck OK; unit 79 passed; e2e 16 passed, 0 failed, 0 skipped (6 suites); build exit 0
- **Test count before feature**: 71 unit (per tasks.md) → **after**: 79 unit (+8), and +1 e2e (broker)
- **Skipped tests**: none
- **Containers**: `spf-notver-rabbit`, `spf-notver-pg`, both removed. No other container was touched

---

## Open items (Validar depois)

1. **Whitespace-only and non-string `processingRequestId` are untested** (M6, M7 survived). `terminal-event.consumer.ts:85-88`. Scenario: a refactor drops `.trim()` or the `typeof` check. `{processingRequestId:'  '}` or `{processingRequestId: 42}` then reaches `recordDelivery`, and a record is saved with a blank or numeric id, while every test stays green. Fix: add `'   '` and `42` rows to the `it.each` at `terminal-event.consumer.spec.ts:165`.
2. **The second `catch` log line is unguarded by tests** (M10 survived). `terminal-event.consumer.ts:48`. Scenario: a `null` payload arrives while the channel closes during `nack` (shutdown). If someone reverts the `?.`, the warn throws a `TypeError` from the `catch`, which violates ROB-04 AC3; Nest logs an unhandled handler rejection. The message is unsettled either way, so the impact is low. Fix: add a unit test with a `null` payload where `nack` throws.
3. **Wrong-typed fields in an otherwise valid payload are retried, not dead-lettered** (predates this change, outside the ACs). See Edge Cases. Candidate for a follow-up spec: validate the field types in `parseEnvelope` or `recordDelivery`.
4. **Missing `eventId` can match an arbitrary row** (predates this change, out of scope). See Edge Cases.
5. The committed broker suite proves only `data:null`. The missing-`data` half of V48 is proven on a broker only by this Verifier's probe. Optionally add `{pattern:'terminal.event'}` to the suite.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| ROB-04 | Implementing | ✅ Verified (open items 2, 5) |
| ROB-05 | Implementing | ✅ Verified |

---

## Lessons signal

- **Equivalent mutants hide behind layered validation.** "Array accepted" (M2) cannot be observed, because the next check rejects the array anyway. Suggest mutants that target the last guard on a path, or assert the error code when the design fixes one.
- **Coverage of "the catch never throws" needs every log line in the catch.** Each line needs a test that reaches it with a hostile payload; the settle-failure branch is easy to forget.
- **An author deviation that tightens validation (trim) should ship with its own test row.** Otherwise it becomes a silent survivor.
- **Two layers catch a removed CI guard.** The in-suite `CI` guard and the workflow's skip check each detect it on their own. Verify both, because each alone would mask the other's removal.
- **A real-broker probe over the whole payload matrix** took a single scratch copy of the suite and about 30 s. It is cheap insurance when only one case is committed.

---

## Summary

**Overall**: ✅ Ready (with open items)
**Spec-anchored check**: 7/7 ACs matched; 1 minor spec-precision note
**Sensor**: 7/10 non-equivalent killed (+1 equivalent); survivors M6, M7, M10 → open items 1-2
**Gate**: lint, typecheck, 79 unit, 16 e2e (0 skipped), build — all green
