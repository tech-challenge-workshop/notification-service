import { Counter, Histogram, Registry } from 'prom-client';

/** How an email send attempt settled; the only values the `outcome` label takes. */
export type EmailDeliveryOutcome = 'sent' | 'failed';

const OUTCOMES: readonly EmailDeliveryOutcome[] = ['sent', 'failed'];

/**
 * The Notification service's Prometheus metrics on a dedicated registry,
 * never the prom-client global, so per-app state holds and e2e suites stay
 * isolated. Call sites use the one process-wide instance.
 *
 * The only label is the bounded `outcome`: no event ids, request ids or
 * recipients (AD-015).
 */
export class NotificationMetrics {
  private readonly registry = new Registry();

  private readonly emailDeliveryTotal = new Counter({
    name: 'fiapx_email_delivery_total',
    help: 'Email send attempts by outcome, counted once per settled attempt; a deduplicated redelivery is not an attempt.',
    labelNames: ['outcome'],
    registers: [this.registry],
  });

  private readonly emailSendDuration = new Histogram({
    name: 'fiapx_email_send_duration_seconds',
    help: 'Time an email send attempt took to settle, success or failure.',
    registers: [this.registry],
  });

  constructor() {
    this.initializeOutcomes();
  }

  recordEmailDelivery(
    outcome: EmailDeliveryOutcome,
    durationSeconds: number,
  ): void {
    this.emailDeliveryTotal.inc({ outcome });
    this.emailSendDuration.observe(durationSeconds);
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  resetMetrics(): void {
    this.registry.resetMetrics();
    this.initializeOutcomes();
  }

  /**
   * Both outcomes are exposed at 0 before the first send, so the scrape
   * always carries the family (OBS-50) and a rate over it has a baseline.
   */
  private initializeOutcomes(): void {
    for (const outcome of OUTCOMES) {
      this.emailDeliveryTotal.inc({ outcome }, 0);
    }
  }
}

export const notificationMetrics = new NotificationMetrics();
