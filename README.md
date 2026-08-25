# Notification Service

Notification Service consumes terminal FIAP X processing events, sends one completion or failure email, and records delivery independently from the processing request lifecycle.

See [the service boundary](docs/service-boundary.md) for ownership, integrations, and explicit exclusions.

## Foundation scope

This repository intentionally contains no NestJS, RabbitMQ, SES, or persistence implementation yet. The approved system architecture is in the workspace's `docs/foudation.md`.
