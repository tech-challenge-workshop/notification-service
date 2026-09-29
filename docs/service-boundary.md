# Notification Service service boundary

The Notification Service tells the owner that a request finished, by email, once per terminal event. It never changes a request. This page is its contract with the rest of the system; the mechanics are in the [README](../README.md).

## Owns

- Consuming the terminal event of every request that reaches `COMPLETED` or `FAILED`.
- One email attempt per event: a completion notice, or a failure notice carrying the Catalog's `failureReason` ([README, What is sent](../README.md#what-is-sent)).
- Its delivery record, in its own `notification` schema, and the metrics of sends and failures.

## Does not own

- Request state, the outbox or any event it could publish: `processing-catalog`. The service publishes nothing.
- Resolving who the owner is or what their address is: `fiap-x-api` reads it from the token's `email` claim and the Catalog carries it on the event (AD-015). This service never queries an identity provider.
- Download URLs, storage keys shown to the user, the ZIP: `fiap-x-api` and `processing-worker`. The email carries no link and no key.
- The queue, its DLQ and the delivery limit: the platform's broker definitions and policy (AD-011, AD-012).
- The SMTP server: Mailpit locally, configured by the platform.

## Interfaces

**Consumed**: `terminal.event` on `notification.terminal`, a JSON Nest envelope whose `data` carries `eventId`, `processingRequestId`, `ownerUserId`, `ownerEmail`, `status`, then `zipStorageKey` when `COMPLETED` or `failureReason` when `FAILED`, `occurredAt` and an optional `correlationId` (AD-016). There is no version field: this repository keeps its own copy of the DTO (AD-003). Validation rules: [README, The terminal event](../README.md#the-terminal-event).

**Outbound**: plain-text email over SMTP to `ownerEmail` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`).

**HTTP**: `/health` (broker and database), `/health/live`, `/metrics`; and `GET /local/deliveries/:processingRequestId` only when `LOCAL_INTEGRATION=true`, for the platform smoke.

## Data

Table `delivery_record` in schema `notification`, under its own role, with `event_id` as primary key and the outcome as `email_sent_at` or `email_error` (an error code only). There is no column for the recipient's address. Migrations run at boot; `synchronize` is never on (AD-009). Details: [README, Persistence](../README.md#persistence).

## Invariants

- One send attempt per `eventId`: the primary key deduplicates, and a redelivery of an event whose attempt completed sends nothing.
- A failed email is recorded and counted; it never changes the request's terminal result and is not retried.
- The recipient's address is used only for the send: never stored, logged, put in `email_error` or used as a metric label (AD-015, AD-017).

## Failure policy

- An invalid event (not JSON, no payload, no `processingRequestId`, bad `status`, no `ownerEmail`, both or neither of `zipStorageKey` and `failureReason`): `nack` without requeue, to `notification.terminal.dlq`.
- SMTP failure: recorded as the error code, acked.
- Database away or any other unexpected error: requeued after `RABBITMQ_RETRY_BACKOFF_MS` (AD-012).
- Delivery is at-least-once in two windows: two replicas racing on a redelivery, and a send that succeeds when writing its outcome fails. Both can send a second email ([README, Exactly once, and its limits](../README.md#exactly-once-and-its-limits); V72 in the [roadmap](ROADMAP.md#open-items)).

## Decisions that bind it

AD-001, AD-003, AD-005 (SMTP, a standard protocol), AD-008 (deduplication in PostgreSQL, no cache tier), AD-009 (schema per service, migrations only), AD-011 and AD-012 (broker-owned topology, classify then settle), AD-015 (address from the event only), AD-016, AD-017 (logs, redaction, metrics) and AD-018 (image on GHCR, run by the kind cluster). The log is [`fiap-x-platform/.specs/STATE.md`](https://github.com/tech-challenge-workshop/fiap-x-platform/blob/main/.specs/STATE.md).
