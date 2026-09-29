import { randomUUID } from 'node:crypto';
import {
  correlationContext,
  parseCorrelationId,
} from '../observability/correlation-context';

/**
 * The message's own `correlationId`, flat or inside a Nest `{pattern, data}`
 * envelope, or null when it has none or it is invalid. A body that is not
 * JSON, or a `data` that is not an object, also yields null: the handler
 * rejects that message on its own path, not this lookup.
 */
function correlationIdOf(content: string): string | null {
  let body: unknown;
  try {
    body = JSON.parse(content);
  } catch {
    return null;
  }
  if (body && typeof body === 'object' && 'data' in body) {
    body = body.data;
  }
  if (!body || typeof body !== 'object') {
    return null;
  }
  // Strict parse (L-010): a non-string is replaced, never String()-coerced.
  return parseCorrelationId((body as Record<string, unknown>).correlationId);
}

/**
 * Runs a consumer's handling inside the message's correlation scope, so every
 * log line it emits carries the pipeline id (OBS-46). A missing or invalid id
 * gets a fresh one and never fails the message (OBS-47): the handler runs
 * either way and its own outcome, settled or thrown, passes through untouched.
 * The scope ends when `handle` settles.
 */
export function withMessageCorrelation<T>(
  content: string,
  handle: () => Promise<T>,
): Promise<T> {
  const id = correlationIdOf(content) ?? randomUUID();
  return correlationContext.runWithCorrelation(id, handle);
}
