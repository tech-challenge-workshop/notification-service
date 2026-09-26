# Catalog Messaging Hardening Design — notification

**Spec**: `.specs/features/catalog-messaging-hardening/spec.md`
**Status**: Draft

---

## Architecture Overview

The consumer's `catch` gets the same shape the Catalog and the Worker already use. A new `settleFailedMessage(channel, message, error)`:

- **Permanent errors are nacked at once without requeue.** These are `InvalidTerminalEventError` and a `SyntaxError` from parsing.
- **Anything else is requeued after `retryBackoffMs()`.**

Parsing moves inside the `try`, so a non-JSON body reaches that classification.

---

## Code Reuse Analysis

| Component | Location | How to Use |
| --- | --- | --- |
| Catalog's `settle-failed-message.ts` | `processing-catalog/src/infrastructure/rabbitmq/settle-failed-message.ts` | Same algorithm, copied (AD-003: no shared package), with MSG-06's blank-value rule |
| `TerminalEventConsumer` | `src/notifications/infrastructure/messaging/terminal-event.consumer.ts:30-52` | Its `catch` calls the helper; the three `nack` branches collapse into it |

---

## Components

### `src/notifications/infrastructure/messaging/settle-failed-message.ts` (new)

- `retryBackoffMs(): number` works as follows:
  - unset, empty or whitespace → 1000;
  - a finite number ≥ 0 → that value;
  - anything else → 1000.
- `isPermanentFailure(error)` is true for `InvalidTerminalEventError` or `SyntaxError`.
- `settleFailedMessage(channel, message, error)` handles the two cases:
  - permanent → `nack(message, false, false)`, with no wait;
  - otherwise → wait `retryBackoffMs()`, then `nack(message, false, true)`.

### `TerminalEventConsumer`

- **Change**: the body is parsed inside the `try`. The `catch` logs the event id and the error name, as it does today, then `await settleFailedMessage(...)`.

---

## Error Handling Strategy

| Error | Handling |
| --- | --- |
| Non-JSON body | DLQ on the first delivery, no wait |
| `InvalidTerminalEventError` | DLQ, as today |
| `DeliveryPersistenceError` or anything else | Wait for the backoff, then requeue |

---

## Risks & Concerns

| Concern | Location | Impact | Mitigation |
| --- | --- | --- | --- |
| A pause holds a prefetch slot | Consumer | Fewer messages in flight while the database is down | Intended: that is the back-pressure AD-012 asks for |
| Shutdown during a pause | Consumer | The message is neither acked nor nacked | The broker redelivers it on channel close (spec edge case); tested with a fake channel |

---

## Tech Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Duplicate the helper rather than share it | Copy | AD-003: services keep local code; three small copies, each tested |
