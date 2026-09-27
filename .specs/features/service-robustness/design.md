# Service Robustness Design — notification

**Spec**: `.specs/features/service-robustness/spec.md`
**Status**: Draft

---

## Architecture Overview

The change touches two files, `terminal-event.consumer.ts` and `settle-failed-message.ts`:

1. **The consumer validates the payload before using it.** Inside its `try`, `parseEnvelope(message)` does three things:
   - It `JSON.parse`s the body. A `SyntaxError` becomes `InvalidTerminalEventError('Body is not JSON', 'MALFORMED_JSON')`.
   - It requires the payload to be an object and not an array. Otherwise it throws `InvalidTerminalEventError('Payload is not an object', 'INVALID_PAYLOAD')`.
   - It requires a non-blank string `processingRequestId`, as today.
2. **The `catch` never throws.** It logs `event?.eventId ?? 'unknown'`, and the payload stays typed `unknown` until it is validated.
3. **Only `InvalidTerminalEventError` is permanent.** `isPermanentFailure` becomes `error instanceof InvalidTerminalEventError`. A bare `SyntaxError` is no longer permanent; only the parse inside `parseEnvelope` classifies as malformed.

---

## Components

| Component | Change | Tests |
| --- | --- | --- |
| `parseEnvelope` (private, in the consumer) | Parse and validate, as in step 1 | Unit: `data: null`, missing, `[]`, `"x"`, `1`, `{}` → `nack(false)` immediately, no delivery, no throw. `not json` → `nack(false)` |
| `catch` in `TerminalEventConsumer` | Optional chaining in both log lines | Unit: a null payload does not throw from `catch` |
| `isPermanentFailure` | Only `InvalidTerminalEventError` | Unit: `new SyntaxError()` is transient, so `nack(true)` after the backoff |
| Real broker | e2e: publish `{"pattern":"terminal.event","data":null}` → one message in `notification.terminal.dlq`, with `x-death` rejected/1 | Runs against a RabbitMQ loaded with the platform's `definitions.json`: a dedicated container locally, and in CI the definitions imported as the Worker does. `RABBITMQ_TEST_URL` is required; without it the suite fails in CI |

---

## Risks & Concerns

| Concern | Impact | Mitigation |
| --- | --- | --- |
| Nest already nacks a non-JSON body before the handler runs (a spec A finding) | The consumer-level parse is defence in depth | The `null`-data case does reach the handler, because the JSON is valid. That is what the broker e2e proves |
| The CI job needs a broker loaded with the definitions | A new CI step | Copy the Worker's step: a job service plus an import through the management API |
