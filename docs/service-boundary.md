# Notification Service service boundary

## Owns

- Consumption of terminal processing events.
- One completion or failure email per terminal event.
- Its own notification-delivery record and operational monitoring of email failures.

## Primary technology context

NestJS and TypeScript, RabbitMQ, and Amazon SES.

## Integrations

- Consumes versioned terminal events published by Processing Catalog through RabbitMQ.
- Sends email through Amazon SES.
- Uses the terminal event's owner identity and result details without changing Processing Request state.

## Does not own

- Processing Request lifecycle transitions, request persistence, or transactional outbox operations.
- HTTP authentication, status lookup, or presigned S3 URL issuance.
- FFprobe/FFmpeg processing, ZIP generation, or S3 binary storage.
- Shared database tables with other services.

## Source of truth

This foundation reflects `docs/foudation.md`, `docs/FIAP X.pdf`, and `docs/POSTECH - SOAT - Fase 5 - Hacka.pdf` in the parent workspace. It is not a product implementation.
