import type { Options as PinoHttpOptions } from 'pino-http';
import { CorrelationContext } from './correlation-context';

/** The probe endpoints kept out of the access log (OBS-55). */
export const ACCESS_LOG_EXCLUDED_PATHS = [
  '/health',
  '/health/live',
  '/metrics',
];

/**
 * The path a probe addresses, as the router matches it: the query string and
 * a trailing slash reach the same handler, so they must not reach the log.
 */
function probePath(url: string): string {
  const path = url.split('?', 1)[0];
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

// SPEC_DEVIATION: design.md lists only `*.`-prefixed paths plus `*.envelope`.
// The redactor's wildcards need a parent key, so a root-level `{ ownerEmail }`
// would survive, and a logged terminal event (`{ event: { data: { ownerEmail } } }`)
// nests the field two levels deep. The bare keys and the two-level wildcard
// are added, and so are the keys that carry the recipient on the send path:
// `to` (EmailMessage) and nodemailer's `accepted`/`rejected` address lists.
// `zipStorageKey` rides the terminal event, so it is covered as in the
// sibling services.
// Reason: OBS-49's outcome (no log line contains the owner's address) holds
// for every shape this service handles, not only the design's literal list.
const REDACTED_KEYS = [
  'email',
  'ownerEmail',
  'to',
  'envelope',
  'accepted',
  'rejected',
  'zipStorageKey',
];
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  ...REDACTED_KEYS,
  ...REDACTED_KEYS.map((key) => `*.${key}`),
  ...REDACTED_KEYS.map((key) => `*.*.${key}`),
];

// `service` lives in the root mixin, not pino-http `customProps`: customProps
// reaches only request-scoped loggers, and OBS-48 requires it on every line
// (bootstrap and the RMQ consumer included).
const SERVICE_NAME = 'notification-service';

export interface RootLoggerConfig {
  pinoHttp: PinoHttpOptions;
}

export function buildRootLoggerConfig(
  context: CorrelationContext,
): RootLoggerConfig {
  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? 'info',
      timestamp: () => `,"timestamp":${Date.now()}`,
      mixin: () => {
        const correlationId = context.getCorrelationId();
        return correlationId === undefined
          ? { service: SERVICE_NAME }
          : { service: SERVICE_NAME, correlationId };
      },
      redact: { paths: REDACT_PATHS, remove: true },
      autoLogging: {
        ignore: (req) => {
          const url = req.url;
          return (
            url !== undefined &&
            ACCESS_LOG_EXCLUDED_PATHS.includes(probePath(url))
          );
        },
      },
    },
  };
}
