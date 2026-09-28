# Observability Tasks — Notification Service

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/observability/design.md`
**Status**: Draft

> **Merge order**: order-free relative to the other service repos; merges before the `fiap-x-platform` S8 PR.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: CI workflow (`.github/workflows/ci.yml`: unit with coverage, e2e against real Postgres + broker suite, fail-on-skipped, lint `--max-warnings 0`, typecheck, build); `package.json` scripts; existing specs colocated `src/**/*.spec.ts` + `test/*.e2e-spec.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Observability infra (context, logger, metrics) | unit | All branches; L-010 strict parse; redaction of email fields | `src/observability/*.spec.ts` | `npm test` |
| Consumer / delivery service touched | unit | 1:1 to touched ACs; happy + edge + error | colocated `*.spec.ts` | `npm test` |
| Broker-level behavior (dedup no double-count, failure outcome, correlation chain) | e2e | Real broker + Mailpit: exactly-once metric; failed send counted once; generated id on missing field | `test/*.e2e-spec.ts` | `npm run test:e2e` |
| Config / module wiring / main.ts | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Generated from `package.json` - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npm test` |
| Full | After tasks touching broker/db e2e | `npm test && npm run test:e2e` |
| Build | After phase completion or config-only tasks | `npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build` |

---

## Execution Plan

Pure dependency chains: each task depends only on the previous one.

### Phase 1: Observability foundation

```
T1 -> T2 -> T3 -> T4
```

### Phase 2: Correlation and delivery metrics

```
T4 -> T5 -> T6 -> T7 -> T8
```

### Phase 3: Metrics exposition and health

```
T8 -> T9 -> T10 -> T11
```

### Phase 4: End-to-end verification

```
T11
```

---

## Task Breakdown

### T1: CorrelationContext (ALS + strict parser)

**What**: `runWithCorrelation`, `getCorrelationId`, `getOrGenerateCorrelationId`, `parseCorrelationId` (trim + `/^[\x20-\x7E]{1,128}$/`; non-strings → null — L-010).
**Where**: `src/observability/correlation-context.ts`
**Depends on**: None
**Reuses**: `node:async_hooks`, `node:crypto`
**Requirement**: foundation for OBS-46/47

**Tools**: Skill: `tlc-spec-driven` (per protocol); MCP: NONE

**Done when**:

- [ ] Concurrent runs isolated; bounds and non-string rejections verified
- [ ] Gate check passes: `npm test`
- [ ] Test count: 10 new unit tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(notification): add the correlation context for observability`

---

### T2: Pino root logger config

**What**: ALS `mixin`; redact paths (`req.headers.authorization`, `*.ownerEmail`, `*.email`, `*.envelope` defensive); `autoLogging.ignore` for `/health`, `/health/live`, `/metrics`; `LOG_LEVEL` default `info`.
**Where**: `src/observability/logger.config.ts`
**Depends on**: T1
**Reuses**: T1
**Requirement**: OBS-48, OBS-49

**Tools**: Skill: `tlc-spec-driven` (per protocol); MCP: NONE

**Done when**:

- [ ] Log lines single JSON with `service: 'notification-service'` and the ALS correlation id
- [ ] A recipient address under any `ownerEmail`/`email` key in a logged object is redacted
- [ ] Gate check passes: `npm test`
- [ ] Test count: 7 new unit tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(notification): add the structured logger config with email redaction`

---

### T3: ObservabilityModule + wiring

**What**: `LoggerModule.forRoot(rootConfig)` + CorrelationContext singleton; AppModule imports it; `main.ts` uses buffered pino logging (replacing the `console.error` on microservice start failure with the logger).
**Where**: `src/app.module.ts`
**Depends on**: T2
**Reuses**: T2
**Requirement**: OBS-48

**Tools**: Skill: `tlc-spec-driven` (per protocol); MCP: NONE

**Done when**:

- [ ] Gate check passes: `npm run lint && npm run typecheck && npm run build`
- [ ] Test count: no new tests (wiring layer - matrix; e2e in T11)

**Tests**: none
**Gate**: build

**Commit**: `feat(notification): wire the observability module into the app`

---

### T4: Terminal-event DTO field

**What**: `TerminalEventDto` gains optional `correlationId`.
**Where**: `src/notifications/dtos/terminal-event.dto.ts`
**Depends on**: T3
**Reuses**: existing DTO
**Requirement**: OBS-46

**Tools**: Skill: `tlc-spec-driven` (per protocol); MCP: NONE

**Done when**:

- [ ] DTO carries the optional field (type-level, consumed by T6)
- [ ] Gate check passes: `npm run typecheck && npm test`
- [ ] Test count: 1 new unit test passes (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(notification): add the correlation id to the terminal event dto`

---

### T5: with-correlation helper

**What**: `with-correlation.ts`: parse from the event → ALS.run → handler; absent/invalid → generated id; never dead-letters for this reason alone (malformed-event handling keeps its existing settle path untouched — V58 regression-watch).
**Where**: `src/messaging/with-correlation.ts`
**Depends on**: T4
**Reuses**: T1
**Requirement**: OBS-46, OBS-47

**Tools**: Skill: `tlc-spec-driven` (per protocol); MCP: NONE

**Done when**:

- [ ] Unit: valid id flows into the handler context; absent/number/object inputs get a generated id and the handler still runs
- [ ] Unit: a `data: null` message keeps its existing (separate) malformed-event path — no behavior change from the wrapper
- [ ] Gate check passes: `npm test`
- [ ] Test count: 7 new unit tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(notification): add the consumer correlation wrapper`

---

### T6: Consumer wrap

**What**: `TerminalEventConsumer` opens the ALS scope around its handler (dedup guard included in the scope; metric placement in T7 stays dedup-safe).
**Where**: `src/notifications/infrastructure/messaging/terminal-event.consumer.ts`
**Depends on**: T5
**Reuses**: T5 helper
**Requirement**: OBS-46, OBS-47

**Tools**: Skill: `tlc-spec-driven` (per protocol); MCP: NONE

**Done when**:

- [ ] Unit: event with `n-9` yields log-context `n-9` through the handling path; missing field yields a generated id and a normal ack
- [ ] Gate check passes: `npm test`
- [ ] Test count: 4 new unit tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(notification): propagate the correlation id through the consumer`

---

### T7: Delivery metrics (dedup-safe)

**What**: `NotificationMetrics` (`fiapx_email_delivery_total{outcome}`, `fiapx_email_send_duration_seconds`) invoked in `NotificationDeliveryService` exactly when a send attempt settles — after the dedup guard, so a redelivery hit never increments; `resetMetrics()`.
**Where**: `src/notifications/application/notification-delivery.service.ts`
**Depends on**: T6
**Reuses**: prom-client, existing delivery flow
**Requirement**: OBS-50..53

**Tools**: Skill: `tlc-spec-driven` (per protocol); MCP: NONE

**Done when**:

- [ ] Unit: successful send increments `sent` once + observes duration; throwing send increments `failed` once + observes duration; dedup-hit path increments nothing
- [ ] Gate check passes: `npm test`
- [ ] Test count: 6 new unit tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(notification): count email deliveries exactly once per send attempt`

---

### T8: Metrics registry + controller

**What**: Dedicated `Registry` + `GET /metrics` controller serving `registry.metrics()` (unauthenticated — no guard exists); `resetMetrics()` export for tests.
**Where**: `src/observability/metrics.controller.ts`
**Depends on**: T7
**Reuses**: T7 families
**Requirement**: OBS-50, OBS-55

**Tools**: Skill: `tlc-spec-driven` (per protocol); MCP: NONE

**Done when**:

- [ ] Unit: exposition contains both families with bounded labels after traffic
- [ ] Gate check passes: `npm test`
- [ ] Test count: 3 new unit tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(notification): expose the prometheus metrics endpoint`

---

### T9: Honest health + liveness

**What**: `/health` returns 503 `{status:'error', ...}` when the broker or database indicator is unhealthy (replacing the always-200 + `ready:false` body), 200 otherwise; add `GET /health/live` -> 200.
**Where**: `src/health/health.controller.ts`
**Depends on**: T8
**Reuses**: both indicators unchanged
**Requirement**: OBS-54, OBS-55

**Tools**: Skill: `tlc-spec-driven` (per protocol); MCP: NONE

**Done when**:

- [ ] Unit: indicator mocks flip the status code (not just the body); liveness stays 200
- [ ] Gate check passes: `npm test && npm run test:e2e`
- [ ] Test count: 5 new unit tests pass (no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `feat(notification): make readiness honest and add liveness`

---

### T10: Access-log exclusion for probes

**What**: Confirm pino `autoLogging.ignore` covers `/health`, `/health/live`, `/metrics` (configured in T2) with a unit assertion pinning the list, so a future config edit cannot silently log-probe-flood.
**Where**: `src/observability/logger.config.ts`
**Depends on**: T9
**Reuses**: T2 config
**Requirement**: OBS-55

**Tools**: Skill: `tlc-spec-driven` (per protocol); MCP: NONE

**Done when**:

- [ ] Unit: the ignore list matches the three endpoints exactly
- [ ] Gate check passes: `npm test`
- [ ] Test count: 2 new unit tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `test(notification): pin the probe exclusion list for access logs`

---

### T11: Observability e2e sweep (real broker + Mailpit)

**What**: Broker e2e: one `COMPLETED` and one `FAILED` terminal event plus a redelivery of the first → `/metrics` shows exactly one `sent` and one `failed`, never two `sent`; event with `correlationId: n-9` puts `n-9` in every captured log line of its handling; a message without the field is handled with a generated id; no captured line contains the recipient address (success and failure paths); with RabbitMQ stopped: `/health` 503, `/health/live` 200, `/metrics` 200.
**Where**: `test/observability.e2e-spec.ts`
**Depends on**: T10
**Reuses**: existing broker e2e harness + Mailpit container from the stack
**Requirement**: OBS-46..55

**Tools**: Skill: `tlc-spec-driven` (per protocol); MCP: NONE

**Done when**:

- [ ] All assertions pass on the real broker
- [ ] Gate check passes: `npm test && npm run test:e2e && npm run lint && npm run typecheck && npm run build`
- [ ] Test count: 9 new e2e tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `test(notification): prove the observability slice end to end`

---

## Phase Execution Map

```
Phase 1:  T1 -> T2 -> T3 -> T4
Phase 2:  T4 -> T5 -> T6 -> T7 -> T8
Phase 3:  T8 -> T9 -> T10 -> T11
Phase 4:  T11
```

Execution is strictly sequential — one task at a time, gate before commit, one Conventional Commit per task.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 module | ✅ Granular |
| T2 | 1 module | ✅ Granular |
| T3 | module + wiring | ⚠️ Cohesive bootstrap |
| T4 | 1 DTO | ✅ Granular |
| T5 | 1 helper | ✅ Granular |
| T6 | 1 consumer | ✅ Granular |
| T7 | 1 service instrumentation | ✅ Granular |
| T8 | registry + controller | ⚠️ One exposition surface |
| T9 | health controller | ✅ Granular |
| T10 | config assertion | ✅ Granular |
| T11 | 1 spec | ✅ Granular (verification slice) |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | none | none | ✅ Match |
| T2 | T1 | T1 -> T2 | ✅ Match |
| T3 | T2 | T2 -> T3 | ✅ Match |
| T4 | T3 | T3 -> T4 | ✅ Match |
| T5 | T4 | T4 -> T5 | ✅ Match |
| T6 | T5 | T5 -> T6 | ✅ Match |
| T7 | T6 | T6 -> T7 | ✅ Match |
| T8 | T7 | T7 -> T8 | ✅ Match |
| T9 | T8 | T8 -> T9 | ✅ Match |
| T10 | T9 | T9 -> T10 | ✅ Match |
| T11 | T10 | T10 -> T11 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | observability infra | unit | unit | ✅ OK |
| T2 | observability infra | unit | unit | ✅ OK |
| T3 | config/wiring | none | none (e2e in T11) | ✅ OK |
| T4 | DTO | unit | unit | ✅ OK |
| T5 | helper | unit | unit | ✅ OK |
| T6 | consumer | unit | unit | ✅ OK |
| T7 | service | unit | unit | ✅ OK |
| T8 | controller | e2e (route) | unit + e2e in T11 | ⚠️ Route assertions consolidated in the T11 sweep |
| T9 | controller | unit + e2e | unit | ⚠️ Status-flip e2e asserted in T11 sweep |
| T10 | config | unit | unit | ✅ OK |
| T11 | e2e layer | e2e | e2e | ✅ OK |
