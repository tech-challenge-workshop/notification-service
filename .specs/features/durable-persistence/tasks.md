# Durable Persistence Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/durable-persistence/design.md`
**Status**: Complete

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/features/full-lifecycle/tasks.md` (prior matrix for this repository), `test/jest-e2e.json`, `package.json` scripts. No coverage threshold is configured anywhere in the repository.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Application service | unit | Unchanged by this slice; existing coverage must not regress | `src/notifications/application/*.spec.ts` | `npm test` |
| Persistence adapter | integration | Every port method against a real PostgreSQL, plus a concurrent duplicate resolving to one row and no error | `test/*.integration-spec.ts` | `npm run test:e2e` |
| Health indicator | unit | Ready when the database is up, not ready when it is down, liveness unaffected | `src/health/*.spec.ts` | `npm test` |
| Entity and config | none | Build gate only - they declare shape and carry no behaviour | `src/notifications/infrastructure/persistence/*.entity.ts` | build gate only |
| Delivery flow | integration | Both terminal statuses recorded, survive a restart, and absorb their own redelivery | `test/*.integration-spec.ts` | `npm run test:e2e` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm test` |
| Full | After tasks touching persistence | `npm test && npm run test:e2e` |
| Build | After phase completion | `npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build` |

**Note**: integration tests need PostgreSQL and RabbitMQ. Start both first: `docker compose -f ../fiap-x-platform/compose.yaml up -d postgres rabbitmq`.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

This slice is small for one reason worth keeping in view: the repository port is **already asynchronous**, so nothing outside the adapter changes shape.

### Phase 1: PostgreSQL behind the existing port

```
T1 → T2 → T3 → T4
```

### Phase 2: Durability proven

```
T5
```

---

## Task Breakdown

### T1: Add the data source and its configuration

**What**: Add TypeORM, a data source reading connection settings from the environment, and register it in the module.
**Where**: `src/notifications/infrastructure/persistence/data-source.ts`
**Depends on**: None
**Reuses**: The environment-variable convention already used for `RABBITMQ_URL`
**Requirement**: DP-01, DP-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Connection settings come from the environment with no credential in the repository
- [x] `synchronize` is off, so migrations are the only way the schema changes
- [x] The service still boots with the in-memory repository when no database is configured
- [x] Quick gate passes: `npm test`

**Tests**: none
**Gate**: quick

**Evidence**: `0ea9fba`. `data-source.ts` aponta para o schema `notification` sob role propria, sem acesso ao schema do catalog. `synchronize` desligado (AD-009).

---

### T2: Add the delivery entity and its migration

**What**: Map `DeliveryRecord` onto `delivery_record` with `event_id` as the primary key, and add the migration.
**Where**: `src/notifications/infrastructure/persistence/delivery-record.entity.ts`
**Depends on**: T1
**Reuses**: The `DeliveryRecord` shape settled in S2, including the two optional outcome fields
**Requirement**: DP-04, DP-07, DP-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `event_id` is the primary key, so deduplication is a schema guarantee rather than an application convention
- [x] `zip_storage_key` and `failure_reason` are nullable and persist as absent rather than as empty strings
- [x] `processing_request_id` is indexed, since the observation route reads by it
- [x] The entity carries no persistence annotation into the domain class
- [x] Applying the migration twice makes no change on the second run
- [x] Full gate passes

**Tests**: integration
**Gate**: full

**Evidence**: `0ea9fba`. `event_id` tipado `text`, nao `uuid`: o contrato declara string, e o e2e daqui rejeitou ids nao-UUID - foi este servico que expos o mesmo defeito latente no catalog.

---

### T3: Implement the repository against PostgreSQL

**What**: Add the TypeORM adapter satisfying the existing port, translating a unique-key violation into the already-recorded delivery.
**Where**: `src/notifications/infrastructure/persistence/typeorm-delivery.repository.ts`
**Depends on**: T2
**Reuses**: The in-memory adapter's behaviour as the specification of what this must do
**Requirement**: DP-01, DP-02, DP-03, DP-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Every port method is exercised against a real PostgreSQL
- [x] A record written, then read after the connection is re-established, returns every field by value
- [x] Two concurrent saves of the same `eventId` produce exactly one row and neither raises
- [x] A unique violation is **not** surfaced as a persistence error, since that would requeue forever against a row that is already correct
- [x] Any other failure still surfaces as `DeliveryPersistenceError`, so the consumer keeps requeuing what a retry can fix
- [x] Full gate passes

**Tests**: integration
**Gate**: full

**Evidence**: `0ea9fba`. `TypeOrmDeliveryRepository` traduz violacao de unicidade do PostgreSQL (`23505`) no registro ja existente em vez de erro de persistencia. Isso importa: os dois escritores concorrentes precisam ter sucesso, senao o perdedor requeue para sempre contra uma linha que ja esta correta. O e2e encena a corrida com `Promise.all` e verifica que sobra exatamente uma linha.

---

### T4: Report the database in readiness

**What**: Add a database health indicator and include it in the health endpoint.
**Where**: `src/health/database.health-indicator.ts`
**Depends on**: T3
**Reuses**: `rabbitmq-health.indicator.ts` as the template
**Requirement**: DP-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Readiness is false when the database is unreachable and true when it is up
- [x] Liveness stays healthy while the database is down
- [x] Build gate passes

**Tests**: unit
**Gate**: build

**Evidence**: `0ea9fba`. `GET /health` da stack em execucao responde `{"status":"ok","ready":true}`, com readiness cobrindo broker e banco - com o banco fora, todo evento terminal viraria apenas requeue. Liveness nao depende do banco.

---

### T5: Prove durability end to end

**What**: Extend the integration suite to record both terminal statuses, survive a restart, and absorb a redelivery.
**Where**: `test/durable-persistence.integration-spec.ts`
**Depends on**: T4
**Reuses**: The broker setup and the local observation route from the S2 suite
**Requirement**: DP-02, DP-03, DP-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A completed and a failed delivery are recorded, then read through a new data source with every field intact
- [x] Replaying both events leaves the row count and every stored field unchanged, asserted by value and not by count alone
- [x] A contract violation still records nothing, so an invalid event never becomes the cached answer for a redelivery
- [x] Build gate passes

**Tests**: integration
**Gate**: build

**Evidence**: `0ea9fba`. Durabilidade provada contra PostgreSQL: campos preservados em COMPLETED e em FAILED, sobrevivencia a uma nova conexao, redelivery absorvida sem alterar um unico campo armazenado, e nada gravado para um evento que contradiz o proprio status. Gate completo do notification: lint=0, typecheck=0, `npm test` 48/48, build=0, `npm run test:e2e` 15/15 contra PostgreSQL.

**Commit**: `feat(persistence): make the delivery record durable`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ------→ T2 ------→ T3 ------→ T4
Phase 2:  T5

Phase boundaries (the last task of a phase gates the first task of the next):
          T4 ------→ T5
```

Total: 5 tasks. This packs into a single batch, below the ~7-task worker budget, so Execute runs inline with no sub-agents dispatched.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Data source | 1 file | ✅ Granular |
| T2: Entity and migration | 1 entity + its migration | ✅ Granular |
| T3: PostgreSQL repository | 1 class | ✅ Granular |
| T4: Health indicator | 1 class | ✅ Granular |
| T5: Integration suite | 1 suite | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | no inbound arrow | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 (phase boundary) | ✅ Match |

No task depends on a task in a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Config | none | none | ✅ OK |
| T2 | Entity + migration | integration | integration | ✅ OK |
| T3 | Persistence adapter | integration | integration | ✅ OK |
| T4 | Health indicator | unit | unit | ✅ OK |
| T5 | Delivery flow | integration | integration | ✅ OK |

T1 is the only `Tests: none`, matching the matrix for configuration. It is proven by T3, which cannot reach a database without it.
