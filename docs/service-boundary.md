# Notification Service service boundary

## Owns

- Consumption of terminal processing events.
- One completion or failure email per terminal event.
- Its own notification-delivery record and operational monitoring of email failures.

## Primary technology context

NestJS and TypeScript, RabbitMQ, and SMTP (Mailpit locally).

## Integrations

- Consumes versioned terminal events published by Processing Catalog through RabbitMQ.
- Sends email over SMTP.
- Uses the terminal event's owner identity and result details without changing Processing Request state.

## Does not own

- Processing Request lifecycle transitions, request persistence, or transactional outbox operations.
- HTTP authentication, status lookup, or presigned storage URL issuance.
- FFprobe/FFmpeg processing, ZIP generation, or binary object storage.
- Shared database tables with other services.

## Source of truth

This foundation reflects `docs/foudation.md` and the reference documents in the `fiap-x-platform` repository. It is not a product implementation.
