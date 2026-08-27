# Notification Service Initial Vertical Slice Tasks

## Execution Protocol

Implement these tasks with the `tlc-spec-driven` skill and its Execute flow. Each task ends with an atomic Conventional Commit. No code changes are made in this planning step.

**Design**: `.specs/features/initial-vertical-slice/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from the existing NestJS scaffold and `package.json`. Guidelines found: `notification-service/package.json`; no additional test configuration exists beyond the default Nest/Jest setup.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| DTO / domain types | build gate only | TypeScript compilation and lint pass. | `src/**/*.ts` | `npm run build` |
| Repository | unit | All public methods (`findByEventId`, `save`); happy path and duplicate key handling. | `src/**/__tests__/*.spec.ts` or `src/**/*.spec.ts` | `npm test` |
| Service | unit | All spec ACs mapped to branches: valid terminal event, duplicate `eventId`, non-terminal rejection. | `src/**/*.spec.ts` | `npm test` |
| Consumer | unit | Valid/duplicate/invalid event handling; ack/nack behavior mocked. | `src/**/*.spec.ts` | `npm test` |
| NestJS application | build gate | Build, lint, and all tests pass with no uncommitted changes. | project root | `npm run build`, `npm run lint`, `npm test` |

## Gate Check Commands

> Generated from `notification-service/package.json`.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After unit-test tasks | `npm test` |
| Full | After consumer task | `npm test` |
| Build | After phase completion or config-only tasks | `npm run build && npm run lint && npm test` |

---

## Execution Plan

### Phase 1: Model and repository contract

```
T1 → T2 → T3
```

### Phase 2: Repository implementation, service, and consumer

```
T3 → T4 → T5 → T6
```

### Phase 3: NestJS gate verification

```
T6 → T7
```

---

## Task Breakdown

### T1: Create local TerminalEventDto

**What**: Define the local DTO that documents the consumed terminal-event JSON shape.
**Where**: `src/notifications/dtos/terminal-event.dto.ts`
**Depends on**: None
**Reuses**: NestJS `@nestjs/common` `class-validator` conventions; field names from `docs/foudation.md`.
**Requirement**: NOT-01, NOT-03

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] DTO contains `eventId`, `processingRequestId`, `ownerUserId`, `status`, `zipStorageKey?`, `failureReason?`, and `occurredAt`.
- [x] `status` is constrained to `COMPLETED` or `FAILED`.
- [x] Build gate passes: `npm run build`.

**Tests**: build gate only
**Gate**: build

---

### T2: Create DeliveryRecord domain model

**What**: Define the delivery-record domain shape.
**Where**: `src/notifications/domain/delivery-record.ts`
**Depends on**: T1
**Reuses**: Plain TypeScript interface/class; field names from `docs/foudation.md`.
**Requirement**: NOT-01, NOT-02

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] `DeliveryRecord` contains `eventId`, `processingRequestId`, `ownerUserId`, `status`, and `recordedAt`.
- [x] Build gate passes: `npm run build`.

**Tests**: build gate only
**Gate**: build

---

### T3: Create DeliveryRepository interface

**What**: Define the repository port that hides storage details.
**Where**: `src/notifications/domain/delivery.repository.ts`
**Depends on**: T2
**Reuses**: Domain-driven repository pattern.
**Requirement**: NOT-01, NOT-02

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] `DeliveryRepository` interface declares `findByEventId(eventId: string): Promise<DeliveryRecord | undefined>` and `save(record: DeliveryRecord): Promise<DeliveryRecord>`.
- [x] Build gate passes: `npm run build`.

**Tests**: build gate only
**Gate**: build

---

### T4: Implement InMemoryDeliveryRepository

**What**: Provide an in-memory implementation of `DeliveryRepository` that deduplicates by `eventId`.
**Where**: `src/notifications/infrastructure/persistence/in-memory-delivery.repository.ts`
**Depends on**: T3
**Reuses**: JavaScript `Map`; existing NestJS provider registration pattern.
**Requirement**: NOT-02

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] `save` stores a new record when `eventId` is unseen.
- [x] `save` returns the existing record when `eventId` already exists.
- [x] `findByEventId` returns the stored record or `undefined`.
- [x] Quick gate passes: `npm test`.
- [x] Test count: repository tests pass.

**Tests**: unit
**Gate**: quick

---

### T5: Implement NotificationDeliveryService

**What**: Implement the service that records one delivery per terminal event and rejects non-terminal statuses.
**Where**: `src/notifications/application/notification-delivery.service.ts`
**Depends on**: T4
**Reuses**: `DeliveryRepository` interface; `TerminalEventDto`; `DeliveryRecord`.
**Requirement**: NOT-01, NOT-03, NOT-04

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [x] `recordDelivery` creates a `DeliveryRecord` for a valid `COMPLETED` or `FAILED` event.
- [x] `recordDelivery` returns the existing record for a duplicate `eventId`.
- [x] `recordDelivery` throws a domain error for a non-terminal status.
- [x] It does not call SES or modify Processing Request state.
- [x] Quick gate passes: `npm test`.
- [x] Test count: service tests pass covering valid, duplicate, and invalid events.

**Tests**: unit
**Gate**: quick

---

### T6: Implement TerminalEventConsumer

**What**: Wire a NestJS microservice consumer that handles RabbitMQ terminal events, validates status, delegates to the service, and acknowledges only on success.
**Where**: `src/notifications/infrastructure/messaging/terminal-event.consumer.ts`
**Depends on**: T5
**Reuses**: NestJS microservice `@EventPattern` or `@MessagePattern`; `NotificationDeliveryService`.
**Requirement**: NOT-01, NOT-02, NOT-03

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [ ] Consumer accepts a terminal event and invokes `NotificationDeliveryService.recordDelivery`.
- [ ] Consumer acknowledges after a successful record.
- [ ] Consumer rejects/nacks non-terminal events without creating a record.
- [ ] Duplicate events are acknowledged without a second record.
- [ ] Quick gate passes: `npm test`.
- [ ] Test count: consumer tests pass covering valid, duplicate, and invalid events.

**Tests**: unit
**Gate**: quick

---

### T7: Verify Nest test, lint, and build gates

**What**: Run the full NestJS quality gates and confirm the workspace is clean before the final commit.
**Where**: `notification-service/`
**Depends on**: T6
**Reuses**: `package.json` scripts.
**Requirement**: NOT-01, NOT-02, NOT-03, NOT-04

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven`

**Done when**:

- [ ] `npm test` passes with all unit tests.
- [ ] `npm run lint` passes with no errors.
- [ ] `npm run build` compiles successfully.
- [ ] `git status` shows only the intended files.

**Tests**: build gate
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:                              T3 ------→ T4 ------→ T5 ------→ T6
Phase 3:                                                                  T6 ------→ T7
```

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | One DTO file | ✅ Granular |
| T2 | One domain model file | ✅ Granular |
| T3 | One repository interface file | ✅ Granular |
| T4 | One repository implementation | ✅ Granular |
| T5 | One service | ✅ Granular |
| T6 | One consumer | ✅ Granular |
| T7 | Quality gate verification | ✅ Granular |

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
| T7 | T6 | T6 → T7 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | DTO / domain types | build gate only | build gate only | ✅ OK |
| T2 | DTO / domain types | build gate only | build gate only | ✅ OK |
| T3 | DTO / domain types | build gate only | build gate only | ✅ OK |
| T4 | Repository | unit | unit | ✅ OK |
| T5 | Service | unit | unit | ✅ OK |
| T6 | Consumer | unit | unit | ✅ OK |
| T7 | NestJS application | build gate | build gate | ✅ OK |
