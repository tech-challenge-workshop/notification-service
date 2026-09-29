# Notification Service roadmap

What has been delivered in this repository, slice by slice, and what is still open. The slices are cross-repository; the platform's [README](https://github.com/tech-challenge-workshop/fiap-x-platform) describes the whole system, and each slice's spec is under [`.specs/features/`](../.specs/features/).

## Delivered

Dates are merge dates on `main`.

| Slice | What it gave the Notification Service | Merged |
| --- | --- | --- |
| Foundation | Repository, NestJS app, terminal-event consumer, in-memory delivery record, then RabbitMQ wiring and a local observation route for a local Docker run | 2026-08-25 to 08-28, direct commits |
| Local-first stack | Managed email replaced by SMTP (AD-005) | #1, 2026-09-19 |
| S1 · CI | `quality` job: lint, typecheck, unit and e2e tests, build | #2, 2026-09-20 |
| S2 · Lifecycle | The outcome of every terminal event retained | #4, 2026-09-21 |
| S3 · Persistence | Durable `delivery_record` on PostgreSQL, migrations at boot (AD-009) | #5, 2026-09-21 |
| Pre-S4 hardening | The persistence suite run against PostgreSQL in CI, failing on any skipped test | #6, 2026-09-25 |
| S4 to S6 | Nothing here: media, authentication and upload live in the other services | - |
| Spec A · Messaging hardening | Pause before requeue; bad messages dead-lettered (MSG-10..11) | #7, 2026-09-26 |
| Spec F · Robustness | Unusable envelopes (`data: null`, no `data`) dead-lettered on first delivery; only parse errors count as malformed (ROB-04..05) | #8, 2026-09-27 |
| S7 · Email | One real email per terminal event over SMTP, address taken from the event (RF-5, AD-015) | #9, 2026-09-28 |
| S8 · Observability | Correlation scope per message, JSON logs with redaction, delivery metrics, readiness that checks the broker and the database (AD-016, AD-017) | #10, 2026-09-29 |
| S9a · Kubernetes | Multi-arch image published to GHCR on every merge to `main`, run by the kind cluster (AD-018) | #11, 2026-09-29 |

## Open items

From the verification record kept alongside the project ("Validar depois"). None blocks the delivered flow.

- **V57**: no test for a `processingRequestId` that is only spaces or a number, nor for the second log line of the consumer's `catch`. By reading: `zipStorageKey: 1` throws a `TypeError` on `.trim()` and is treated as transient (DLQ only after 5 deliveries); an event without `eventId` loses the condition of the dedup query and can be acked as a duplicate without being recorded.
- **V61**: deleting the `configureApp(app)` call in `main.ts` passes every gate, although no email would leave; the string-only `code` guard has no non-string case (`code: 550`).
- **V65**: flaky test: `local-integration` "Channel ended", about 1 run in 12.
- **V66**: the consumer writes no log line per handled message, so a correlation id cannot be followed into this service's logs. Fix: one `info` line per message (event, result, `processingRequestId`).
- **V68**: the arm64 image build runs under QEMU and can hang until the job's 30-minute timeout, so a `:main` image can silently fail to publish. Fix: build each platform on a native runner and merge the manifests.
- **V72**: a second duplicate-email path besides the replica race: when the send succeeds and writing the outcome fails, the message is requeued and the email goes out again. Fix: record the intent (`SENDING`) before sending, or accept and document at-least-once.
- **V73**: `GET /` still answers `Hello World!`, and `test/local-integration.e2e-spec.ts` hard-codes `amqp://localhost:5672` instead of reading `RABBITMQ_TEST_URL`.
