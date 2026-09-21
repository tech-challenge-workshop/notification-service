import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { DeliveryRecord } from '../src/notifications/domain/delivery-record';
import { createDataSource } from '../src/notifications/infrastructure/persistence/data-source';
import { TypeOrmDeliveryRepository } from '../src/notifications/infrastructure/persistence/typeorm-delivery.repository';
import { NotificationDeliveryService } from '../src/notifications/application/notification-delivery.service';
import { TerminalEventDto } from '../src/notifications/dtos/terminal-event.dto';

const describeIfDatabase = process.env.DATABASE_HOST ? describe : describe.skip;

describeIfDatabase('durable delivery record', () => {
  let dataSource: DataSource;
  let repository: TypeOrmDeliveryRepository;
  let service: NotificationDeliveryService;

  beforeAll(async () => {
    dataSource = createDataSource();
    await dataSource.initialize();
    await dataSource.runMigrations();
    repository = new TypeOrmDeliveryRepository(dataSource);
    service = new NotificationDeliveryService(repository);
  }, 30_000);

  afterAll(async () => {
    await dataSource.destroy();
  }, 30_000);

  const completedEvent = (): TerminalEventDto => ({
    eventId: randomUUID(),
    processingRequestId: randomUUID(),
    ownerUserId: 'user-' + randomUUID(),
    status: 'COMPLETED',
    zipStorageKey: 'zips/output.zip',
    occurredAt: new Date().toISOString(),
  });

  const failedEvent = (): TerminalEventDto => ({
    eventId: randomUUID(),
    processingRequestId: randomUUID(),
    ownerUserId: 'user-' + randomUUID(),
    status: 'FAILED',
    failureReason: 'O video excede a duracao maxima de 10 minutos.',
    occurredAt: new Date().toISOString(),
  });

  it('keeps every field of a completed delivery', async () => {
    const event = completedEvent();

    const stored = await service.recordDelivery(event);

    expect(stored.zipStorageKey).toBe(event.zipStorageKey);
    expect(stored.failureReason).toBeUndefined();
    expect(stored.ownerUserId).toBe(event.ownerUserId);
    expect(stored.processingRequestId).toBe(event.processingRequestId);
  });

  it('keeps the reason of a failed delivery, which is what S7 will render', async () => {
    const event = failedEvent();

    await service.recordDelivery(event);
    const found = await repository.findByEventId(event.eventId);

    expect(found!.status).toBe('FAILED');
    expect(found!.failureReason).toBe(event.failureReason);
    expect(found!.zipStorageKey).toBeUndefined();
  });

  it('survives a new connection, which is what durability means here', async () => {
    const event = completedEvent();
    await service.recordDelivery(event);

    const reopened = createDataSource();
    await reopened.initialize();
    try {
      const reread = await new TypeOrmDeliveryRepository(
        reopened,
      ).findByEventId(event.eventId);

      expect(reread).toBeDefined();
      expect(reread!.zipStorageKey).toBe(event.zipStorageKey);
      expect(reread!.ownerUserId).toBe(event.ownerUserId);
    } finally {
      await reopened.destroy();
    }
  }, 30_000);

  it('absorbs a redelivery without changing a single stored field', async () => {
    const event = failedEvent();
    const first = await service.recordDelivery(event);

    const second = await service.recordDelivery(event);

    expect(second.recordedAt.toISOString()).toBe(
      first.recordedAt.toISOString(),
    );
    expect(second.failureReason).toBe(first.failureReason);

    const rows: { n: number }[] = await dataSource.query(
      'SELECT count(*)::int AS n FROM delivery_record WHERE event_id = $1',
      [event.eventId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('resolves a concurrent duplicate to one row, and neither caller fails', async () => {
    const record = new DeliveryRecord();
    record.eventId = randomUUID();
    record.processingRequestId = randomUUID();
    record.ownerUserId = 'user-concurrent';
    record.status = 'COMPLETED';
    record.zipStorageKey = 'zips/output.zip';
    record.recordedAt = new Date();

    // Both racing writers must succeed: the loser learns the row already
    // exists rather than raising a persistence error that would requeue
    // forever against a row that is already correct.
    const [a, b] = await Promise.all([
      repository.save(record),
      repository.save({ ...record, ownerUserId: 'user-loser' }),
    ]);

    expect(a.eventId).toBe(record.eventId);
    expect(b.eventId).toBe(record.eventId);

    const rows: { n: number }[] = await dataSource.query(
      'SELECT count(*)::int AS n FROM delivery_record WHERE event_id = $1',
      [record.eventId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('records nothing for an event that contradicts its own status', async () => {
    const event = { ...completedEvent(), zipStorageKey: undefined };

    await expect(service.recordDelivery(event)).rejects.toMatchObject({
      code: 'MISSING_ZIP_STORAGE_KEY',
    });

    await expect(
      repository.findByEventId(event.eventId),
    ).resolves.toBeUndefined();
  });

  it('applies the migrations with nothing left pending', async () => {
    await expect(dataSource.showMigrations()).resolves.toBe(false);
  });
});
