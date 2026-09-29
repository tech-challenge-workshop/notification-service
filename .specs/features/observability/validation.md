# Observability Validation

**Date**: 2026-09-28
**Spec**: `.specs/features/observability/spec.md`
**Diff range**: `origin/main..HEAD` = `e92534c..225db0e` (3 docs commits + 13 task/fix commits + 3 round-1 fix commits `c866eb2`, `2af9485`, `225db0e`)
**Verifier**: independent sub-agent (author ≠ verifier), **round 2 (final)**

---

## Round 1 → Round 2

| Round-1 finding | Fix | Round-2 evidence | Status |
| --- | --- | --- | --- |
| Fix 1 (Major): OBS-48. `main.ts`'s `app.useLogger` was undiscriminated (M11 survived) | `c866eb2`: the composition moved to `src/configure-app.ts:11-21` (`useLogger` + `connectMicroservice`). `main.ts:10` and the e2e (`test/observability.e2e-spec.ts:134-142`) both call it | **M11 re-run: killed** by 4 e2e tests. With `useLogger` gone, Nest's plain-text logger writes nothing JSON to stdout, so `handling.length >= 1` fails (`test/observability.e2e-spec.ts:340`, `:375`, `:408`, `:447`). M10 re-run: still killed (3 e2e) | ✅ Closed |
| Fix 2 (Minor, latent): OBS-49. A send error with no `code` fell back to `error.message` (address in the warn line and in `email_error`) | `225db0e`: `notification-delivery.service.ts:157-160`. Only a non-empty **string** `code` is kept; anything else becomes `'Unknown email send failure'`. New unit test `notification-delivery.service.spec.ts:302-320` | **Gap-2 revert (M12') killed** by `notification-delivery.service.spec.ts:302`, which asserts `JSON.stringify(warn.mock.calls)).not.toContain(address)` and `emailError === 'Unknown email send failure'`. Probe on the real app, below: 0 addresses in logs across 5 error shapes | ✅ Closed |
| Nit: unused `CorrelationContext` DI provider | `2af9485`: removed from `observability.module.ts` | tsc/lint 0. No consumer injects it (`grep` on src) | ✅ Closed |

**`main.ts` behavior unchanged**: diffed against the pre-fix `main.ts` (`9adcdb1`). The sequence is still `create(AppModule, {bufferLogs:true})` → `useLogger(app.get(Logger))` → `connectMicroservice(createMicroserviceOptions())` → `startAllMicroservices()` (error logged with `logger.error`) → `listen(PORT ?? 3003)` → `flushLogs()`. `configureApp`'s default argument evaluates `createMicroserviceOptions()` at call time, as before. **Production smoke** (`node dist/main` built from HEAD, real Postgres + RabbitMQ, stdout **not** tampered, so pino writes to its own fd-1 destination): 17/17 stdout lines are JSON with `timestamp`/`level`/`msg`/`service:"notification-service"`, and stderr is empty. `/health` and `/health/live` returned 200. The event published with `correlationId:'prod-smoke'` was consumed and recorded (`email_sent_at` set). No line contained `@example.com`.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T11 | ✅ Done | 39 `[x]`, 0 `[ ]` in tasks.md |
| T9 follow-ups (`8cb4ae6`, `c7d2a94`) | ✅ Done | Readiness bug fixes, discriminated in round 1 (M7, M8) |
| F1 (`c866eb2`) | ✅ Done | The Test Coverage Matrix row now reads "e2e via `configureApp`; `main.ts` itself (create, listen) build gate only" (tasks.md:27) |
| F2 (`225db0e`) | ✅ Done | Unit test added. tasks.md:361 |

---

## Spec-Anchored Acceptance Criteria

> 10 requirements: OBS-46..55 (P1 AC1–4 = OBS-46..49; P2 AC1–6 = OBS-50..55). Line numbers are taken from HEAD `225db0e`.

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| OBS-46 WHEN the consumer receives a terminal event THEN set the log context from its `correlationId` before handling, and clear it when the handler settles | The handler and its log lines see the message's id. The context is `undefined` after success and after a throw | `src/notifications/infrastructure/messaging/terminal-event.consumer.spec.ts:374-388`: `expect(seen).toBe('n-9')`, `expect(correlationContext.getCorrelationId()).toBeUndefined()`. `:390-408`: `expect(seenByLog).toEqual(['n-9'])` for the failure log, `nack(message,false,false)`. `src/messaging/with-correlation.spec.ts:33-49`: `toBeUndefined()` after resolve and after reject. e2e `test/observability.e2e-spec.ts:322-353`: on the real app's stdout (composed by `configureApp`), `expect(line['correlationId']).toBe('n-9')` for each handling line, and every scoped line is `'n-9'` (`:347-350`) | ✅ PASS (M10 killed) |
| OBS-47 IF the event has no `correlationId` or an invalid one THEN generate a fresh id and do NOT fail or dead-letter the message | A generated UUID, the message acked, main queue and DLQ at 0. Strict parse (no coercion; 1–128 printable ASCII) | `src/observability/correlation-context.spec.ts:59-81`: bounds, and `parseCorrelationId(123)` → `toBeNull()`. `with-correlation.spec.ts:51-88`: absent/number/object/null/blank/129/non-printable → `toMatch(UUID)`. `terminal-event.consumer.spec.ts:410-440`: `toMatch(UUID)`, `ack` called, `nack` not called. e2e `test/observability.e2e-spec.ts:356-383` (absent) and `:386-417` (numeric `42`): `toMatch(UUID)`, `not.toBe('42')`, `queueDepth(QUEUE)` 0, `queueDepth(DLQ)` 0 | ✅ PASS |
| OBS-48 WHEN the service emits any log line THEN it is JSON with `timestamp`, `level`, `msg`, `service`, and the current `correlationId` | Every line is JSON with those keys and `service:'notification-service'`, through the service's **own** wiring | `src/observability/logger.config.spec.ts:65-79`: `typeof timestamp === 'number'`, `level` 30, `msg`, `service`, `correlationId` `'n-9'`. e2e `test/observability.e2e-spec.ts:337-346`, on the stdout of the app composed by `configureApp` (`:134`): `line['correlationId']`, `line['service']`, `typeof timestamp`, `typeof level`. Every captured line goes through `JSON.parse` (`:86`), and `handling.length >= 1` (`:340`). Production smoke of `dist/main`: 17/17 lines JSON | ✅ PASS (M11, M15, M17 killed). ⚠️ Precision flag 1 |
| OBS-49 WHEN any code path handles the owner's email THEN no log line contains that address. Redaction covers it independently of developers remembering | 0 occurrences of the recipient in any captured line, on the success and failure paths | e2e `test/observability.e2e-spec.ts:421-453` at `LOG_LEVEL=trace`: `expect(lines.length).toBeGreaterThanOrEqual(1)`, `expect(raw).not.toContain(sent.ownerEmail)` / `failed.ownerEmail` / `'@example.com'`. Unit `logger.config.spec.ts:91-163`: key paths removed at the root, `*.` and `*.*.`. `notification-delivery.service.spec.ts:302-320`: a code-less error naming the address → `expect(JSON.stringify(warn.mock.calls)).not.toContain(address)`, `expect(record.emailError).toBe('Unknown email send failure')`. `:277-300`: `emailError` `'ECONNREFUSED'`, with no IP and no port | ✅ PASS (M12', M16, M19 killed; probe below) |
| OBS-50 WHEN Prometheus scrapes `GET /metrics` THEN it includes `fiapx_email_delivery_total{outcome="sent\|failed"}` and `fiapx_email_send_duration_seconds` | 200. Both outcome series (0-initialized), the histogram, and the exact content type | `src/observability/metrics.controller.spec.ts:27-32`: `toBe('text/plain; version=0.0.4')`. `:34-68`: `# TYPE … counter`, `{outcome="sent"} 1`, `{outcome="failed"} 1`, `_count 2`. `:71-96`: label names exactly `{outcome, le}`. e2e `test/observability.e2e-spec.ts:476-482`: exact content type, `{outcome="sent"} 0` | ✅ PASS |
| OBS-51 WHEN a delivery attempt settles THEN increment `fiapx_email_delivery_total` exactly once with the matching `outcome`, and observe the elapsed time | `sent`/`failed` +1 per attempt, `_count` +1, `_sum` equal to the real elapsed time | `notification-delivery.service.spec.ts:374-391`: 50 ms send → `{outcome="sent"} 1`, `failed 0`, `sendCount 1`, `sum >= 0.04 && < 5`. `:393-405`: throw → `failed 1`, `sent 0`, `sendCount 1`. e2e `test/observability.e2e-spec.ts:255-287`: `sent === 1`, `failed === 1`, `_count === 2` | ✅ PASS |
| OBS-52 WHEN the same `eventId` is redelivered after a completed send THEN no second increment of either outcome | Counters stay at 1/1, `_count` equals the number of attempts, one email sent | `notification-delivery.service.spec.ts:407-416` (sent), `:418-427` (failed), `:429-446` (concurrent insert → `sendCount 0`). e2e `test/observability.e2e-spec.ts:255-287`: both events redelivered on the real broker, `sent 1`, `failed 1`, `_count 2`, `delivered.sent` length 1, queue and DLQ at 0 | ✅ PASS |
| OBS-53 WHEN the SMTP send throws THEN increment `failed` and record the failure in the delivery record as today (no state change to the request) | `failed 1`, `sent 0`, `emailError` holds the transport code, no `emailSentAt`, message acked | e2e `test/observability.e2e-spec.ts:291-319`: real `SmtpEmailSender` → `127.0.0.1:1`, `expect(record?.emailError).toMatch(/^E[A-Z]+$/)`, `not.toContain('127.0.0.1')`, `emailSentAt` undefined, `failed 1`, `sent 0`, queue and DLQ at 0. Unit `notification-delivery.service.spec.ts:393-405`: `toBe('ECONNREFUSED')` | ✅ PASS |
| OBS-54 WHILE RabbitMQ or PostgreSQL is unreachable THEN `/health` returns 503 and `/health/live` returns 200 | 503 with `{status:'error', rabbitmq, database}` naming the dependency that is down. Live 200 `{status:'ok'}`. `/metrics` still 200 | `src/health/health.controller.spec.ts` (supertest): each single loss and the double loss → `503` plus a whole-body `toEqual`. Live → 200. `rabbitmq-health.indicator.spec.ts:67-83`, `health.module.spec.ts:11-30`. e2e `test/observability.e2e-spec.ts:456-485` (broker unreachable: `503`, `toEqual({status:'error', rabbitmq:'down', database:'up'})`, live 200, metrics 200) and `:488-525` (DB destroyed at runtime: first 200 `{ok,up,up}`, then `503` `{error,up,down}`, live 200, metrics 200) | ✅ PASS |
| OBS-55 The metrics and health endpoints SHALL NOT require authentication and SHALL NOT produce access-log lines | 200/503 with no credentials. 0 access-log lines for the three probes. Look-alike paths still logged | e2e `test/observability.e2e-spec.ts:528-559`: no auth, `not.toBe(401/403)`, `expect(accessLines.map(url)).toEqual(['/'])`. Unit `logger.config.spec.ts:165-240`: exempt list pinned `toEqual([...3])`, query string and trailing slash → `toEqual([])` | ✅ PASS |

**Status**: ✅ All 10 ACs are covered with assertions that match the spec's outcome. The 2 ⚠️ spec-precision flags carry over from round 1; both judged outcome-met.

**Payload/conjunction rule**: health bodies are asserted by value with a whole-object `toEqual`. Metric series are asserted as exact sample values. OBS-51 (increment **and** duration) is asserted in one test (`notification-delivery.service.spec.ts:383-390`). OBS-53 (counted **and** recorded **and** acked) is asserted together (`observability.e2e-spec.ts:304-316`). OBS-54 (503 **and** live 200, plus the `/metrics` 200 edge case) is asserted in both e2e tests. The new F2 test pairs the log assertion with the record assertion (`notification-delivery.service.spec.ts:313-316`).

**Spec-precision flags (outcome-met, unchanged from round 1)**:
1. ⚠️ OBS-48 `timestamp` is epoch milliseconds as a number (`logger.config.ts:62`). The spec names only the key. Lines outside any scope omit `correlationId` (`logger.config.spec.ts:81-89`).
2. ⚠️ In the P2 independent test, "one FAILED terminal event → one `failed`" is read as the *send* outcome. The e2e uses an unreachable recipient (a decided item).

### Probe (a): is the production log destination (stdout) exercised?

- The config passes no destination (`logger.config.ts:59-79`), so pino defaults to stdout. The e2e marks `process.stdout` as tampered (`test/observability.e2e-spec.ts:45-54`), so pino writes through `process.stdout.write`, which the test captures. Every log-content test requires at least one captured line (`:340`, `:375`, `:408`, `:447`).
- **M15** swapped the destination for a discard stream (`pinoHttp: [config, { write: () => undefined }]`). It was **killed** by 5 observability e2e tests. A swap to stderr or to an explicit fd destination would also leave the capture empty and fail the same assertions.
- The one path the e2e cannot reach is pino's untampered fd-1 destination, which production uses. I covered it with the production smoke above: `node dist/main` wrote 17 JSON lines to stdout and nothing to stderr. Evidence only, not a regression test.

### Probe (b): PII through error OBJECT properties (scratch worktree `/tmp/notif-v2-probe`, removed; porcelain matched the baseline)

The probe booted the real `AppModule` through `configureApp` on the real broker and Postgres at `LOG_LEVEL=trace`, and captured stdout. It published 5 COMPLETED events (`correlationId:'pii-probe-2'`), each to its own victim address:

| Case | Error produced | `code` | Address in `message` / `response` / `rejected` | Logged | `email_error` |
| --- | --- | --- | --- | --- | --- |
| A | Real `SmtpEmailSender` → fake SMTP answering `RCPT` with `550 5.1.1 <addr>: Recipient address rejected` | `EENVELOPE` | yes / yes / `[addr]` | `…: EENVELOPE`, address absent | `EENVELOPE` |
| B | Real `SmtpEmailSender` → fake SMTP accepting RCPT, then answering end-of-DATA with `554 … <addr> is blocked` | `EMESSAGE` | yes / yes / - | `…: EMESSAGE`, address absent | `EMESSAGE` |
| C | `new Error(\`mailbox ${to} unavailable\`)` | none | yes / - / - | `…: Unknown email send failure` | same |
| D | Error with `response`, `rejected:[to]`, `envelope:{to:[to]}`, and no code | none | yes / yes / yes | `…: Unknown email send failure` | same |
| E | Error with a numeric `code: 550` | `550` (number) | yes | `…: Unknown email send failure` | same |

The result was 15 lines in total, **0 occurrences of any victim address** and none of `@example.com` or the storage key. No error object is ever logged whole:
- The service's only log call sites (`grep` on `src`) interpolate fixed text or a vetted string: `notification-delivery.service.ts:161` (the code only), `terminal-event.consumer.ts:43-45` / `:52-54` (`error.message` of `InvalidTerminalEventError`/`DeliveryPersistenceError`, which is fixed text built from `eventId`/`status`; the raw send error is only the `cause`, never logged), and `rabbitmq-health.indicator.ts:31` (`err.err.message` of an amqp disconnect).
- Nest's exception handlers never see a handler error: the consumer catches everything inside the correlation scope (`terminal-event.consumer.ts:36-57`), and `withMessageCorrelation` does not throw (`with-correlation.ts:13-28`).
- `main.ts:15` logs `{ err }` whole, but only for a microservice start failure (amqp), which carries no recipient.
- The HTTP routes (`/`, `/health*`, `/metrics`) never handle an address.

---

## Discrimination Sensor

**Isolation**: each mutant ran in its own `git worktree add --detach /tmp/notif-v2-mN HEAD`, with the real `node_modules` symlinked. `mutate.py` asserted exactly one match per replacement. Each run did `tsc --noEmit` (0 for all mutants, so none died by compile error), then the full unit suite, then the full e2e suite on the real Postgres `:55432` and RabbitMQ `:5672`. Each worktree was then removed with `git worktree remove --force` and pruned. After every mutant, `git status --porcelain` of the real tree matched the pre-sensor baseline (the 3 uncommitted `.specs` files). Scripts are in the session scratchpad at `notif-v2/`.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M10 (re-run) | `src/observability/observability.module.ts:16` | Logger factory gets a fresh `CorrelationContext` instead of the shared ALS store | ✅ Killed. e2e: 3 (`n-9`, generated id, numeric id) |
| M11 (re-run) | `src/configure-app.ts:17` | `app.useLogger(app.get(Logger))` removed | ✅ Killed. e2e: 4 (`n-9`, generated id, numeric id, never logs the recipient). **Survived in round 1** |
| M12' (Gap-2 revert) | `src/notifications/application/notification-delivery.service.ts:159` | Code-less error falls back to `error.message` again | ✅ Killed. Unit `keeps the recipient address out of the log and the record…` (the e2e survives it: ECONNREFUSED always has a code) |
| M14 (new) | `src/main.ts:10` | `configureApp(app)` call removed from the entrypoint | ❌ Survived (unit 152/152, e2e 26/26). See Open item 1 |
| M15 (new) | `src/observability/observability.module.ts:16` | Production log destination swapped for a discard stream | ✅ Killed. e2e: 5 observability tests (plus a "Channel ended" flake in `local-integration`, unrelated to the mutant) |
| M16 (new) | `src/observability/logger.config.ts:33` | `'to'` removed from the redacted keys | ✅ Killed. Unit `redacts the recipient on the send path…` |
| M17 (new) | `src/observability/logger.config.ts:62` | `"timestamp"` key renamed to `"time"` | ✅ Killed. Unit `emits one json line…`, e2e `n-9 on every log line` |
| M18 (new) | `src/configure-app.ts:19` | `connectMicroservice(consumer)` removed from the composition | ✅ Killed. e2e: 6 |
| M19 (new) | `src/notifications/application/notification-delivery.service.ts:162` | Send-failure warn line names the recipient (`… to ${ownerEmail}`) | ✅ Killed. Unit (F2 test), e2e `never logs the recipient address…` |
| M20 (new) | `src/notifications/application/notification-delivery.service.ts:159` | Non-string `code` accepted via `String(code)` | ❌ Survived (unit 152/152, e2e 26/26). See Open item 2 |

**Sensor depth**: expanded, 10 behavior-level mutations. It re-runs M10, M11 and the Gap-2 revert, and adds the log destination, the timestamp key, redaction, the consumer composition, the message-string PII path, the code guard and the entrypoint call.
**Result**: PASS ✅ (10 injected, 8 killed, 2 survived). Neither survivor falls on the spec-AC surface (see Open items). Both round-1 targets are now killed.

---

## Interactive UAT Results

Not performed: this is a backend/observability feature. The automated checks cover it (unit, e2e, sensor, the two probes, and the production smoke).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ `configureApp` is a 2-statement function shared by 2 callers (it replaces duplicated wiring, so it is not a speculative abstraction). The dead DI provider is removed |
| Surgical changes | ✅ The fix commits touch only `main.ts`, `configure-app.ts`, the observability module, the delivery-service catch block, and their tests |
| No scope creep | ✅ No HTTP request metrics (a decided item) |
| Matches patterns | ✅ The same `configureApp` seam the sibling services use |
| Spec-anchored outcome check | ✅ 10/10 |
| Per-layer coverage | ✅ The composition now runs in the e2e. Only `main.ts`'s create/listen is build-gate only, as the tasks.md:27 matrix documents |
| Every test maps to an AC/edge/Done-when | ✅ The new F2 unit test maps to OBS-49 / F2 |
| Documented guidelines followed | ✅ `.github/workflows/ci.yml` gates. The CI-unset guard (`test/observability.e2e-spec.ts:28-34`) prevents a green-by-skip |

**Changed-test integrity (round 2)**: the fix commits change only `test/observability.e2e-spec.ts:132-146`. The manual `useLogger`/`connectMicroservice` there is replaced by `configureApp`, with the same test-broker URL override. No assertion was weakened. The unit test count goes from 151 to 152 (+1 F2 test). The pre-existing test `falls back to a safe message when the send rejects with an empty error message` is unchanged and still green.

---

## Edge Cases

- [x] SMTP connection fails → `failed` counted exactly once, duration observed, message acked, no DLQ (`observability.e2e-spec.ts:291-319`)
- [x] `correlationId` numeric or an object → replaced, not coerced (`with-correlation.spec.ts:67-88`; e2e `:386-417`)
- [x] Database down → `/metrics` 200 while `/health` is 503 (`observability.e2e-spec.ts:509-522`)
- [ ] ⚠️ Scrape during a send → consistent snapshot. There is no test. The guarantee is structural: `inc` and `observe` run synchronously back to back (`notification-delivery.service.ts:168-171`). This is an observation carried over from round 1.

---

## Gate Check

- **Gate command**: `npm run lint && npm run typecheck && npm test && DATABASE_HOST=localhost DATABASE_PORT=55432 DATABASE_NAME=fiapx DATABASE_SCHEMA=notification DATABASE_USER=notification DATABASE_PASSWORD=notification RABBITMQ_TEST_URL=amqp://guest:guest@localhost:5672 npm run test:e2e && npm run build`
- **Exit codes** (this Verifier ran each step directly on the real tree at HEAD `225db0e`):
  - `npm run lint` → 0
  - `npm run typecheck` → 0
  - `npm test` → 0: 23/23 suites, **152 passed**, 0 failed, 0 skipped
  - `npm run test:e2e` → 0: 7/7 suites, **26 passed**, 0 failed, 0 skipped (a second real-tree run was also 26/26, exit 0)
  - `npm run build` → 0
- **Test count before feature** (`origin/main`, round 1): 100 unit + 17 e2e = 117
- **Test count after feature**: 152 unit + 26 e2e = 178 (+61; +1 since round 1)
- **Skipped tests**: none
- **Failures**: none on the real tree
- **`local-integration` "Channel ended" flake**: 1 in 12 full e2e runs this round (2 real-tree runs + 10 mutant runs; it hit during M15). It is the same test as round 1 (`records a FAILED delivery carrying its reason`), and it sits outside this diff. It never occurred on the real tree.

---

## Open items (Validar depois; non-blocking, final round)

1. **M14: `main.ts`'s `configureApp(app)` call is not discriminated.** This is the irreducible entrypoint seam: tasks.md:27 documents `main.ts` create/listen as build-gate only. Dropping the call would disable the logger **and** the consumer, so no email would be sent at all. `/health` would still answer 200, because the RabbitMQ indicator owns its own connection. That would surface in any deployment or platform smoke, not as a silent observability regression like M11 was. Today's evidence is the production smoke above (`node dist/main`: JSON stdout, event consumed). Optional hardening: a process-level e2e that spawns `node dist/main` and asserts one JSON line and one consumed event, or a unit spec that mocks `NestFactory.create` and asserts `configureApp` was called.
2. **M20: the `typeof code === 'string'` guard is untested for non-string codes.** No spec outcome depends on it: probe case E shows a numeric code yields `'Unknown email send failure'`, and a numeric or object `code` stringifies without an address. The one leak shape is contrived (an array `code` containing the address). Optional: one unit case with `code: 550`, asserting `emailError === 'Unknown email send failure'`.
3. Carry-overs from round 1: the mid-send scrape consistency is structural (no test), runtime broker loss is covered at unit level only, the `local-integration` channel flake is worth a follow-up, and M4, M9 and M12' are killed only by unit tests.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| OBS-46, OBS-47 | Implemented (pending Verifier) | ✅ Verified |
| OBS-48 | Implemented; F1 pending Verifier round 2 | ✅ Verified (M11 killed; production smoke) |
| OBS-49 | Implemented; F2 pending Verifier round 2 | ✅ Verified (Gap-2 revert and M19 killed; the 5-shape error-object probe shows 0 leaks) |
| OBS-50..55 | Implemented (pending Verifier) | ✅ Verified |

(This Verifier does not edit `spec.md`; the orchestrator applies the status update.)

---

## Summary

**Overall**: ✅ Ready (PASS)

**Spec-anchored check**: 10/10 ACs match the spec's outcome. 2 ⚠️ spec-precision flags (outcome-met, carried over from round 1)
**Sensor**: 10 injected, 8 killed, 2 survived (M14 entrypoint seam, M20 non-spec hardening; both are open items)
**Gate**: lint, typecheck and build exit 0; unit 152/152; e2e 26/26; 0 skipped

**What works**: both round-1 gaps are closed and discriminated. The service's own composition (`configureApp`) now runs under the e2e, so dropping `useLogger` or the consumer, or discarding the log stream, fails the suite. The production entrypoint emits JSON on real stdout. Only a non-empty string `code` from a send error is recorded, and 5 real and synthetic error shapes, whose `message`, `response`, `rejected` and `envelope` all carry the address, leaked it nowhere. Everything verified in round 1 still holds: exactly-once metrics, the strict correlation parse, the honest 503 readiness, and the probe access-log exclusion.

**Next steps**: record open items 1–2 under "Validar depois", update the `spec.md` traceability to Verified, and commit the report and lessons.
