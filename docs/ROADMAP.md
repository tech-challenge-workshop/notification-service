# Notification Service roadmap specification

## Outcome

Deliver independent, idempotent notification of completed and failed video-processing requests.

## Delivery phases

1. **Bootstrap and quality**: restore dependencies, make Nest gates green, and establish CI.
2. **Terminal-event consumption**: consume versioned completion and failure events from RabbitMQ and validate their contract.
3. **Idempotent delivery**: persist a service-owned delivery record and prevent duplicate email sends for repeated events.
4. **SES integration**: render safe success/failure messages and send through Amazon SES without changing Processing Request state.
5. **Operations**: record and monitor email failures, add integration tests, telemetry, containerization, and deployment configuration.

## Acceptance boundaries

- The service owns notification delivery only; it does not transition requests, process video, or issue download URLs.
- A notification failure is recorded and observable but never changes a terminal processing result.
- The MVP performs one email attempt per terminal event.

## Done

WHEN a terminal processing event is received THEN the service SHALL record one delivery attempt and send exactly one corresponding safe email; IF the event is redelivered THEN it SHALL not send a duplicate email.
