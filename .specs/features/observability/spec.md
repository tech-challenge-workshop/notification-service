# Observability — Notification Service Specification

Part of S8 (observability and autoscale), split across 5 sibling specs (`fiap-x-api` OBS-01..15, `processing-catalog` OBS-16..30, `processing-worker` OBS-31..45, `notification-service` OBS-46..60, `fiap-x-platform` OBS-61..75). This repo's job: consume the terminal event's `correlationId` into its log context, emit the email-delivery metrics (including failures), and split health into readiness/liveness that actually reflects dependency loss.

## Problem Statement

The Notification service is the end of the correlation chain and the source of the RF-5 delivery evidence, but it emits no metrics: email failures are only visible by reading logs. Its `/health` always returns 200 with a `ready` flag in the body — the worst of both worlds for a scraper — and there is no liveness endpoint. The `foudation.md` names email failures as part of the minimum metric set, and AD-015 makes this service the guardian of the owner's email, so its logs must never contain it.

## Goals

- [ ] Every terminal event's `correlationId` flows into the service's log context; missing/invalid ones are replaced, never fatal.
- [ ] `GET /metrics` exposes `fiapx_email_delivery_total{outcome="sent|failed"}` and the send-duration histogram.
- [ ] Readiness (`/health`) returns 503 when RabbitMQ or PostgreSQL is unreachable; liveness (`/health/live`) always 200 while serving; both scrape-friendly.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Retry automático de e-mail | Explicit MVP limit (foudation.md); failures are recorded and measurable, not retried |
| SMTP provider metrics | Mailpit is the whole topology (AD-005); send outcome/duration cover the need |
| RabbitMQ queue-depth metrics | Broker plugin, wired in `fiap-x-platform` |
| KEDA / horizontal autoscale | S9a |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| correlationId transport | Read from the consumed terminal event into the log context; generate one when absent or invalid | Chain completion; matches the API/Catalog/Worker contract decision | n (user skipped; default chosen — review at confirm) |
| ownerEmail in logs | Continues to never appear; pino redaction paths cover `ownerEmail` and SMTP envelope fields as defense in depth behind the S7 rule | AD-015 is this service's core constraint |
| Delivery outcome metric | `fiapx_email_delivery_total{outcome="sent|failed"}` incremented exactly once per terminal event, mirroring the dedup guarantee (one email per eventId) | The metric must inherit the "exactly one" property, or the dashboard double-counts |
| Metric labels | Bounded only (`outcome`); no event ids, request ids, or recipients as labels | Cardinality + AD-015 |
| Health semantics | `/health` 503 when the broker or database indicator is unhealthy (replacing today's always-200), 200 otherwise; `/health/live` 200 while serving | Seed criterion 3; today's `ready:false` body with HTTP 200 is scraper-hostile |
| Health/metrics endpoints | Unauthenticated; not access-logged | Scraping convention; noise |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: correlationId and safe structured logs ⭐ MVP

**User Story**: As an operator, I want every terminal event's correlation id in the service's JSON logs, and a hard guarantee that the owner's email never reaches any log line, so that the chain completes traceably and AD-015 survives a careless edit.

**Why P1**: This service is where the S7 PII rule matters most, and where the correlation chain ends.

**Acceptance Criteria**:

1. WHEN the consumer receives a terminal event THEN it SHALL set the log correlation context from the message's `correlationId` before handling and SHALL clear it when the handler settles. <!-- event-driven -->
2. IF the terminal event lacks a `correlationId` or carries an invalid one THEN the consumer SHALL generate a fresh id for its log context and SHALL NOT fail or dead-letter the message for that reason alone. <!-- unwanted-behavior -->
3. WHEN the service emits any log line THEN it SHALL be JSON carrying `timestamp`, `level`, `msg`, `service`, and the current `correlationId`. <!-- event-driven -->
4. WHEN any code path handles the owner's email THEN no log line SHALL contain that address; the redaction configuration SHALL cover it independently of developers remembering. <!-- event-driven -->

**Independent Test**: Consume a terminal event with `correlationId: n-9` against Mailpit and grep the captured logs: every line of that handling carries `n-9` and no line contains the recipient address; then consume one without the field and assert a generated id and a still-acked message.

---

### P2: Email delivery metrics and honest health

**User Story**: As an operator, I want a Prometheus counter that counts each email delivery exactly once (sent or failed), a send-duration histogram, and readiness/liveness that actually flip on dependency loss, so that the dashboard shows the RF-5 outcome and the platform can scrape honest health.

**Why P1**: The foundation's minimum metric set names email failures; the health fix closes the gap-analysis seed criterion 3 for this service.

**Acceptance Criteria**:

1. WHEN Prometheus scrapes `GET /metrics` THEN the response SHALL include `fiapx_email_delivery_total{outcome="sent|failed"}` and `fiapx_email_send_duration_seconds`. <!-- event-driven -->
2. WHEN an email delivery attempt settles THEN the service SHALL increment `fiapx_email_delivery_total` exactly once with the matching `outcome` and SHALL observe the elapsed send time into the duration histogram. <!-- event-driven -->
3. WHEN the same terminal `eventId` is redelivered after a successful send THEN no second increment of either outcome SHALL occur. <!-- event-driven -->
4. WHEN the SMTP send throws THEN the service SHALL increment `outcome="failed"` and SHALL record the failure in the delivery record as today (no state change to the request). <!-- event-driven -->
5. WHILE RabbitMQ or PostgreSQL is unreachable THEN `GET /health` SHALL respond 503 and `GET /health/live` SHALL respond 200. <!-- state-driven -->
6. The metric exposition and health endpoints SHALL NOT require authentication and SHALL NOT produce access-log lines. <!-- ubiquitous -->

**Independent Test**: With Mailpit up, process one `COMPLETED` and one `FAILED` terminal event plus one redelivery of the first: `/metrics` shows exactly one `sent` and one `failed` increment; stop RabbitMQ and `/health` flips 503 while `/health/live` stays 200.

---

## Edge Cases

- IF the SMTP connection fails mid-send THEN the delivery counts as `failed` exactly once, the duration is still observed, and the existing DLQ/dead-letter behavior is untouched.
- IF the terminal event's `correlationId` is numeric or an object THEN it is treated as invalid and replaced (strict parse, not `String()` coercion — the L-010 lesson).
- IF the database is down THEN `/metrics` SHALL still respond 200 while `/health` reports 503.
- WHEN `/metrics` is scraped during a send THEN the registry snapshot is consistent.

---

## Implicit-Requirement Dimensions Sweep

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | OBS-47: strict parse of the new `correlationId` field |
| Failure / partial-failure | OBS-53: SMTP failure counted once, recorded, no state change |
| Idempotency / retry / duplicate | OBS-52: redelivery never double-counts the metric (inherits the dedup guarantee) |
| Auth boundaries | `/health`, `/health/live`, `/metrics` public by design |
| Concurrency / ordering | Per-message ALS context; single consumer queue keeps ordering |
| Data lifecycle / expiry | N/A — delivery records already persist (S3/S7) |
| Observability | this feature |
| External-dependency failure | Seed criterion 3 codified as OBS-54 |
| State-transition integrity | N/A — the service changes no request state |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| OBS-46 | P1: correlationId (consume context) | Design | Pending |
| OBS-47 | P1: correlationId (fallback) | Design | Pending |
| OBS-48 | P1: structured logs (JSON shape) | Design | Pending |
| OBS-49 | P1: structured logs (email redaction) | Design | Pending |
| OBS-50 | P2: Metrics (exposition set) | Design | Pending |
| OBS-51 | P2: Metrics (exactly-once outcome) | Design | Pending |
| OBS-52 | P2: Metrics (redelivery no double-count) | Design | Pending |
| OBS-53 | P2: Metrics (failure path) | Design | Pending |
| OBS-54 | P2: Health (not-ready on dependency loss) | Design | Pending |
| OBS-55 | P2: Health/Metrics (no auth, no noise) | Design | Pending |

**ID format:** `OBS-[NUMBER]` — `fiap-x-api` owns OBS-01..15; `processing-catalog` OBS-16..30; `processing-worker` OBS-31..45; this repo owns OBS-46..60; `fiap-x-platform` OBS-61..75.

**Coverage:** 10 total, 0 mapped to tasks, 10 unmapped (mapping happens in Tasks).

---

## Success Criteria

- [ ] The terminal-event handling for one eventId produces exactly one `fiapx_email_delivery_total` increment with the correct outcome, provable on a real broker against Mailpit.
- [ ] No captured log line anywhere in the service contains the owner email, even on the failure path.
- [ ] With RabbitMQ stopped: `/health` 503, `/health/live` 200, `/metrics` 200.
