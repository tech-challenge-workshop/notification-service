---
kind: ticket
title: "Notification Service Local Docker Integration Tasks"
status: 0
---

# Notification Service Local Docker Integration Tasks

## Execution Protocol

Implement these tasks with the `tlc-spec-driven` skill and its Execute flow. Each task ends with an atomic Conventional Commit that includes the implementation, tests, and the task status update in this file. No code changes are made in this planning step.

**Design**: `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/.specs/features/local-docker-integration/design.md`
**Status**: Design

---

## Test Coverage Matrix

> Generated from the existing NestJS scaffold and `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/package.json`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Typed errors | unit | Constructors carry distinguishing `code` and extend `Error`. | `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/notifications/domain/errors/*.spec.ts` | `npm test` |
| DTO validation | unit | `TerminalEventDto` rejects missing `processingRequestId` via class-validator/validation pipe. | `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/notifications/dtos/*.spec.ts` or consumer tests | `npm test` |
| Repository | unit | `findByEventId`, `save`; happy path and duplicate key handling. | `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/notifications/infrastructure/persistence/*.spec.ts` | `npm test` |
| Service | unit | All spec ACs: valid terminal event, duplicate `eventId`, non-terminal rejection, typed domain error, typed technical error. | `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/notifications/application/*.spec.ts` | `npm test` |
| Consumer | unit | Valid/duplicate/invalid event handling; ack/nack behavior classified by error type. | `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/notifications/infrastructure/messaging/*.spec.ts` | `npm test` |
| Health | unit | Readiness reflects RabbitMQ availability. | `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/health/*.spec.ts` | `npm test` |
| Local delivery controller | unit/e2e | Route exists only under `LOCAL_INTEGRATION=true`; returns record by `processingRequestId`; returns `404` when absent. | `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/notifications/infrastructure/http/*.spec.ts`, `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/test/*.e2e-spec.ts` | `npm test`, `npm run test:e2e` |
| NestJS application | build gate | Build, lint, and all tests pass with no uncommitted changes. | `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/` | `npm run build && npm run lint && npm test` |
| Docker image | local manual | `docker build` succeeds and container health check passes. | `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/Dockerfile` | `docker build -t notification-service:local .` |

## Gate Check Commands

> Generated from `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/package.json`.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After unit-test tasks | `npm test` |
| E2E | After controller/routing tasks | `npm run test:e2e` |
| Build | After phase completion or config-only tasks | `npm run build && npm run lint && npm test` |
| Docker | After Dockerfile task | `docker build -t notification-service:local . && docker run --rm -p 3003:3003 -e RABBITMQ_URL=amqp://host.docker.internal:5672 notification-service:local` |

---

## Execution Plan

### Phase 1: Typed errors and validation

```
T1 → T2
```

### Phase 2: RabbitMQ wiring, health, and hardened consumer

```
T2 → T3 → T4
```

### Phase 3: Local observation, container, and hygiene

```
T4 → T5 → T6
T5 → T8
T6 → T8
```

### Phase 4: Integration tests and gate verification

```
T8 → T9
T1 → T9
T7
```

---

## Task Breakdown

### T1: Add typed domain and technical errors

**What**: Introduce `InvalidTerminalEventError` and `DeliveryPersistenceError` so the consumer can separate invalid input from transient failures.
**Where**:
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/notifications/domain/errors/invalid-terminal-event.error.ts`
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/notifications/domain/errors/delivery-persistence.error.ts`
**Depends on**: None
**Reuses**: Plain `Error` subclasses with a `code` property.
**Requirement**: NOT-03, NOT-04

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] `InvalidTerminalEventError` carries a `code` such as `INVALID_TERMINAL_STATUS` or `MISSING_PROCESSING_REQUEST_ID`.
- [x] `DeliveryPersistenceError` carries `cause?: Error`.
- [x] Unit tests for both error classes pass.
- [x] Quick gate passes: `npm test`.

**Tests**: unit
**Gate**: quick

---

### T2: Update NotificationDeliveryService to use typed errors

**What**: Replace generic `Error` throws with typed errors and ensure invalid/technical paths are distinguishable.
**Where**: `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/notifications/application/notification-delivery.service.ts`
**Depends on**: T1
**Reuses**: `DeliveryRepository`, `TerminalEventDto`, `DeliveryRecord`, typed errors from T1.
**Requirement**: NOT-01, NOT-03, NOT-04

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] `recordDelivery` throws `InvalidTerminalEventError` for a non-terminal status or missing `processingRequestId`.
- [x] `recordDelivery` throws `DeliveryPersistenceError` when the repository rejects unexpectedly.
- [x] Valid `COMPLETED` and `FAILED` events still create one record.
- [x] Duplicate `eventId` returns the existing record without creating a second one.
- [x] Service unit tests cover valid, duplicate, invalid-domain, and technical-failure branches.
- [x] Quick gate passes: `npm test`.

**Tests**: unit
**Gate**: quick

---

### T3: Wire RabbitMQ microservice, health endpoint, and readiness

**What**: Make the NestJS application a hybrid HTTP + RMQ consumer and expose `/health` whose readiness depends on the RabbitMQ connection.
**Where**:
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/main.ts`
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/messaging/rabbitmq.config.ts`
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/health/health.controller.ts`
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/health/rabbitmq-health.indicator.ts`
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/app.module.ts`
**Depends on**: T2
**Reuses**: `@nestjs/microservices` `Transport.RMQ`; existing `AppModule`.
**Requirement**: NOT-01 (consume), edge case: RabbitMQ unavailable readiness false

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] `main.ts` starts both HTTP (port `PORT ?? 3003`) and RMQ microservice using environment variables `RABBITMQ_URL`, `RABBITMQ_QUEUE`, `RABBITMQ_EXCHANGE`, and `RABBITMQ_ROUTING_KEY`.
- [x] RMQ consumer uses `noAck: false` and manual acknowledgement.
- [x] `HealthController` exposes `GET /health` returning `{ status: 'ok', ready: boolean }`.
- [x] Readiness is `true` only when the RMQ connection is up; otherwise `false`.
- [x] Health controller and indicator have unit tests.
- [x] Quick gate passes: `npm test`.

**Tests**: unit
**Gate**: quick

---

### T4: Harden TerminalEventConsumer with typed error handling

**What**: Update the consumer to validate `processingRequestId`, classify errors by type, and nack invalid-domain events without requeue while requeuing technical failures.
**Where**: `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/notifications/infrastructure/messaging/terminal-event.consumer.ts`
**Depends on**: T3
**Reuses**: `NotificationDeliveryService`, typed errors from T1.
**Requirement**: NOT-01, NOT-03, NOT-04

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] Consumer validates that `processingRequestId` is present before calling `recordDelivery`; otherwise throws `InvalidTerminalEventError`.
- [x] Consumer acks after successful record.
- [x] Consumer nacks with `requeue=false` for `InvalidTerminalEventError`.
- [x] Consumer nacks with `requeue=true` for `DeliveryPersistenceError` or other unexpected errors.
- [x] Duplicate events are acknowledged without a second record.
- [x] Consumer unit tests are updated to assert by error type instead of message text.
- [x] Quick gate passes: `npm test`.

**Tests**: unit
**Gate**: quick

---

### T5: Add local-only delivery observation route

**What**: Expose `GET /local/deliveries/:processingRequestId` only when `LOCAL_INTEGRATION=true`.
**Where**:
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/notifications/infrastructure/http/local-delivery.controller.ts`
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/notifications/infrastructure/http/local-delivery.module.ts`
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/src/app.module.ts`
**Depends on**: T4
**Reuses**: `DeliveryRepository` or `NotificationDeliveryService`; NestJS conditional module registration.
**Requirement**: NOT-05

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] `LocalDeliveryController` implements `GET /local/deliveries/:processingRequestId`.
- [x] The route returns the matching `DeliveryRecord` with HTTP `200`.
- [x] The route returns HTTP `404` when no delivery exists for the request ID.
- [x] `LocalDeliveryModule` is registered only when `process.env.LOCAL_INTEGRATION === 'true'`.
- [x] Controller/module have unit tests; e2e test verifies the route under `LOCAL_INTEGRATION=true` and its absence when the flag is unset.
- [x] Quick and e2e gates pass.

**Tests**: unit + e2e
**Gate**: quick + e2e

---

### T6: Add Dockerfile and runtime health check

**What**: Provide a service-specific container image with an embedded health check for local Docker Compose.
**Where**:
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/Dockerfile`
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/.dockerignore`
**Depends on**: T5
**Reuses**: Existing `package.json` scripts (`npm ci`, `npm run build`, `npm run start:prod`).
**Requirement**: Dockerfile próprio, health

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [ ] `Dockerfile` uses a multistage build based on `node:22-alpine`.
- [ ] Build stage installs dependencies with `npm ci`, copies source, and runs `npm run build`.
- [ ] Runtime stage exposes port `3003` and starts with `npm run start:prod`.
- [ ] `HEALTHCHECK` instruction curls `GET /health` and expects a successful HTTP response.
- [ ] `.dockerignore` excludes `node_modules`, `dist`, `coverage`, `.env*`, `.git`, and `._*`.
- [ ] `docker build -t notification-service:local .` succeeds.

**Tests**: manual Docker gate
**Gate**: docker

---

### T7: Preserve AppleDouble exclusions in lint/Jest

**What**: Keep macOS `._*` resource-fork files out of lint and test runs without changing runtime behavior.
**Where**:
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/.gitignore` (already excludes `._*`)
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/package.json` Jest config
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/eslint.config.mjs`
**Depends on**: None (can run in parallel with earlier phases)
**Reuses**: Existing `.gitignore`, Jest, and ESLint configurations.
**Requirement**: NOT-06

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] `.gitignore` already contains `._*`; no regression is introduced.
- [x] Jest config adds an ignore/exclude pattern for `._*` files.
- [x] ESLint config adds `._*` to its `ignores` array.
- [x] A temporary `._*.spec.ts` file does not break `npm test` or `npm run lint`.
- [x] Build gate passes: `npm run build && npm run lint && npm test`.

**Tests**: build gate
**Gate**: build

---

### T8: Add local integration observability tests

**What**: Prove the end-to-end local path by sending terminal events through RabbitMQ and reading the delivery record through the local-only route.
**Where**:
- `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/test/local-integration.e2e-spec.ts`
**Depends on**: T5, T6
**Reuses**: `supertest`, `amqplib` (or `@nestjs/microservices` client), `AppModule`, `LocalDeliveryModule`.
**Requirement**: NOT-01, NOT-02, NOT-05

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [ ] E2E test starts the NestJS application with `LOCAL_INTEGRATION=true` and a test RabbitMQ connection.
- [ ] It publishes a valid `terminal.event` to the configured queue/exchange.
- [ ] It waits for the consumer to record the delivery.
- [ ] It asserts `GET /local/deliveries/:processingRequestId` returns the matching `DeliveryRecord` with status `COMPLETED`.
- [ ] It publishes the same event again and asserts the local route still returns exactly one record.
- [ ] Quick and e2e gates pass.

**Tests**: e2e
**Gate**: e2e + build

---

### T9: Verify all gates and produce atomic task commits

**What**: Run the full quality gates and ensure every task above is committed atomically with its implementation, tests, and status update.
**Where**: `/Volumes/HIKSEMI/repository/fiap-x/fiapx/notification-service/`
**Depends on**: T1–T8
**Reuses**: `package.json` scripts, `git`.
**Requirement**: NOT-07

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [ ] `npm test` passes with all unit tests.
- [ ] `npm run test:e2e` passes.
- [ ] `npm run lint` passes with zero warnings.
- [ ] `npm run build` compiles successfully.
- [ ] `docker build -t notification-service:local .` succeeds.
- [ ] Each completed task has one Conventional Commit containing its code, tests, and the updated checkbox in this `tasks.md` file.
- [ ] `git status` shows only the intended files.

**Tests**: build gate
**Gate**: build + docker

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2
Phase 2:              T2 ------→ T3 ------→ T4
Phase 3:                                        T4 ------→ T5 ------→ T6
                                                          T5 ------→ T8
                                                          T6 ------→ T8
Phase 4:                                                                    T8 ------→ T9
                                                                             T1 ------→ T9
Parallel:  T7
```

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | Two small error classes + tests | ✅ Granular |
| T2 | One service update + tests | ✅ Granular |
| T3 | RabbitMQ wiring, health controller, indicator + tests | ✅ Granular |
| T4 | One consumer update + tests | ✅ Granular |
| T5 | One controller/module + e2e test | ✅ Granular |
| T6 | Dockerfile + .dockerignore | ✅ Granular |
| T7 | Config-only hygiene change | ✅ Granular |
| T8 | One e2e test file | ✅ Granular |
| T9 | Quality gate verification | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | None | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | None | Parallel | ✅ Match |
| T8 | T5, T6 | T5 → T8, T6 → T8 | ✅ Match |
| T9 | T1–T8 | T8 → T9, T1 → T9 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Typed errors | unit | unit | ✅ OK |
| T2 | Service | unit | unit | ✅ OK |
| T3 | RabbitMQ wiring, health | unit | unit | ✅ OK |
| T4 | Consumer | unit | unit | ✅ OK |
| T5 | Local HTTP route | unit + e2e | unit + e2e | ✅ OK |
| T6 | Dockerfile | manual Docker | manual Docker | ✅ OK |
| T7 | Lint/Jest config | build gate | build gate | ✅ OK |
| T8 | E2E test | e2e | e2e | ✅ OK |
| T9 | NestJS application | build + docker | build + docker | ✅ OK |
