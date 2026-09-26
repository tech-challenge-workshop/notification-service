## Validation: catalog-messaging-hardening (notification) — PASS with open items

**Service**: notification-service · **Branch**: fix/catalog-messaging-hardening · **Diff range**: dd705b1..273ffb4 (T1-T2) · **Verifier**: independent, final round (leftovers are open items)

**Spec-anchored check**: 2/2 requirements (MSG-10, MSG-11), 6/6 ACs + 1 edge case matched the spec outcome; 0 spec-precision gaps
**Gate** (run in a scratch worktree at 273ffb4): lint=0, typecheck=0, `npm test` 71/71 (12 suites), `npm run test:e2e` 15/15 (5 suites, 0 skipped; RabbitMQ on 5672, PostgreSQL on 55445), build=0
**Sensor**: 11 mutations injected, 11 killed, 0 survived
**Real-broker probes**: 5 run (RabbitMQ 4 + PostgreSQL 17, built `dist/main.js`, DLX policy on `notification.terminal`)

---

### Per-AC evidence

| AC | Spec outcome | Evidence (file:line + assertion) | Verdict |
| --- | --- | --- | --- |
| MSG-10 AC1: a transient error waits the backoff, then requeues | no nack before 1000 ms; `nack(msg,false,true)` at 1000 ms | `settle-failed-message.spec.ts:102` (`advanceTimersByTimeAsync(999)` → `nack` not called; +1 ms → `toHaveBeenCalledWith(message,false,true)`, called once). `terminal-event.consumer.spec.ts:177` shows the same through the consumer. Real broker, with PostgreSQL stopped and `RABBITMQ_RETRY_BACKOFF_MS=2000`: redeliveries logged at 4:08:08, :10, :12, :14 and :16, a 2 s cadence with no hot loop | PASS |
| MSG-10 AC2: unset, empty or whitespace → 1000 | 1000 | `settle-failed-message.spec.ts:31` (unset) and `:36` (`''`, `'  '`) → `toBe(1000)`. Code: `settle-failed-message.ts:17` | PASS |
| MSG-10 AC3: `0` → no pause | 0; requeue without waiting | `settle-failed-message.spec.ts:46` → `toBe(0)`; `:118` awaits under fake timers with no clock advance → `nack(message,false,true)` | PASS |
| Assumption: negative or non-numeric → 1000 | 1000 | `settle-failed-message.spec.ts:56` (`-1`, `abc`) → `toBe(1000)`. Code: `settle-failed-message.ts:21` | PASS |
| MSG-11 AC1: non-JSON → reject without requeue on first delivery | `nack(false,false)` at once | Handler path: `terminal-event.consumer.spec.ts:151` (`not json` → `nack(message,false,false)` once, no record, no ack) and `settle-failed-message.spec.ts:126`. Real broker: `not json` and `"just a json string"` reached the DLQ in about 57 ms with `redelivered=false` and x-death reason `rejected`. Nest logged "unsupported event ... Pattern: undefined", which confirms the author's claim that `ServerRMQ.handleEvent` (`@nestjs/microservices` 11.2.3, `server-rmq.js:194-198`) nacks with `requeue=false` before the handler runs | PASS |
| MSG-11 AC2: `InvalidTerminalEventError` → reject without requeue | `nack(false,false)` | `terminal-event.consumer.spec.ts:162`; `settle-failed-message.spec.ts:66,126`. Pre-existing policy tests unchanged (`consumer.spec.ts` "transport policy per rejection"). Real broker: an event without `processingRequestId` went to the DLQ in 59 ms with `redelivered=false` | PASS |
| MSG-11 AC3: no backoff on a rejection | nack with no clock advance | `settle-failed-message.spec.ts:126` (fake timers, never advanced, `nack` called once with `false,false`). Mutant M9 (pause before the permanent check) killed | PASS |
| Edge: shutdown during the pause → message left unacked | no settle; handler resolves; broker redelivers | `terminal-event.consumer.spec.ts:205` (channel closes at 500 ms → `handled` resolves, `settled` equals `[]`). Real broker: `app.close()` 1.5 s into a 3 s pause → warn "Could not settle terminal event evt-c: Channel closed", 0 unhandled rejections, message back to ready (1), DLQ 0. A hard kill of the process also returned the message to ready | PASS |

**Payload/conjunction rule**: every settle assertion checks the exact `(message, false, requeue)` tuple and the call count, and asserts that `ack` was not called. Satisfied.

**Existing tests not weakened**: `git diff --numstat` shows 0 deleted lines in both spec files and no change under `test/`. The pre-existing test `consumer.spec.ts:273` ("nacks a persistence fault with requeue") is unchanged and still asserts `nack(message,false,true)`. It now waits a real 1000 ms.

---

### Discrimination sensor (scratch `git worktree` at 273ffb4, `jest src/notifications/infrastructure/messaging`)

| # | Mutation | Result |
| --- | --- | --- |
| M1 | pause removed (`settle-failed-message.ts:68` → no-op) | KILLED (3 failed) |
| M2 | `SyntaxError` treated as transient | KILLED (3) |
| M3 | `InvalidTerminalEventError` treated as transient | KILLED (8) |
| M4 | blank backoff not defaulted (drop `raw.trim() === ''`) | KILLED (2) |
| M5 | consumer parse removed (`consumer.ts:32`) | KILLED (1) |
| M6 | close-during-pause catch removed (`consumer.ts:48-56`) | KILLED (1) |
| M7 | negative backoff accepted | KILLED (1) |
| M8 | transient requeue flag flipped to `false` | KILLED (6) |
| M9 | pause applied before the permanent check | KILLED (8) |
| M10 | default 1000 → 500 | KILLED (8) |
| M11 | non-numeric coerced to 0 instead of the default | KILLED (1) |

**Score: 11/11 killed, 0 survivors.** Scratch worktree removed. Real tree `git status --porcelain` is empty, at HEAD 273ffb4.

---

### Findings / open items (Validar depois)

1. **[Medium, pre-existing, outside the AC wording but against the Goal "a message that can never succeed goes to the DLQ on its first delivery"] A JSON envelope with `data: null` or no `data` is never settled.** `terminal-event.consumer.ts:34` dereferences `event.processingRequestId` on `null`/`undefined` and throws a TypeError. The `catch` at `:45` then dereferences `event.eventId` again and throws before `settleFailedMessage` is reached, so the handler rejects (`RpcExceptionsHandler` logs the TypeError). Reproduced on the real broker: publishing `{"pattern":"terminal.event","data":null}` and `{"pattern":"terminal.event"}` left `messages_unacknowledged=2` and DLQ 0 indefinitely. When the app stopped, both went back to ready and were redelivered to the same fate. With a quorum queue's delivery limit they eventually dead-letter, but only across connection churn. Suggested fix: guard `event` being a non-object (throw `InvalidTerminalEventError`) and use `event?.eventId` in both log lines.
2. **[Low] `isPermanentFailure` treats any `SyntaxError` as permanent** (`settle-failed-message.ts:38`), not only the body parse. A `SyntaxError` raised inside `recordDelivery` (for example from a driver parsing a malformed stored value) would dead-letter a message that a retry could have fixed. Suggested fix: wrap the consumer's `JSON.parse` (`consumer.ts:32`) in a dedicated error, or classify the parse result locally, instead of matching on `SyntaxError` globally.
3. **[Low, observation] The consumer's own `JSON.parse` (`consumer.ts:32`) is unreachable in the running composition.** With the default deserializer, a non-JSON body has no `pattern`, and Nest dead-letters it before any handler runs (verified). The parse is kept as defence in depth, and only unit tests exercise it. This is not a defect.
4. **[Low, test hygiene] The pre-existing test at `consumer.spec.ts:273` now sleeps a real 1000 ms** because it does not use fake timers or `RABBITMQ_RETRY_BACKOFF_MS=0`. The suite is slower but the test is not weakened.

No finding blocks MSG-10 or MSG-11 as specified.

---

### Lessons signal

- The author's "Nest dead-letters non-JSON before the handler" claim held under a real broker. Checking `server-rmq.js` first made the probe cheap, and runtime behaviour matched the source.
- The hole this round found was on neither the permanent nor the transient branch. It sat in the error handler's own logging (`event.eventId` in `catch`), where an exception skips settlement entirely. Future verifiers of consumers should probe envelopes with valid JSON but null or absent `data`, not only non-JSON bodies and domain-invalid events.
- Helper-level tests with fake timers made the sensor decisive: every mutant died, most of them in several tests. Pairing each helper test with a consumer-level twin (`consumer.spec.ts:151-205`) is what killed M5 and M6, which the helper alone could not see.
- Classifying by the built-in `SyntaxError` type is convenient but broad. Prefer a service-owned error type for "body is not JSON".
