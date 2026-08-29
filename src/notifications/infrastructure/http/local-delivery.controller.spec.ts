import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryRecord } from '../../domain/delivery-record';
import { DELIVERY_REPOSITORY } from '../../domain/delivery-repository.token';
import { LocalDeliveryController } from './local-delivery.controller';

describe('LocalDeliveryController', () => {
  let controller: LocalDeliveryController;
  let repository: { findByProcessingRequestId: jest.Mock };

  beforeEach(async () => {
    repository = { findByProcessingRequestId: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocalDeliveryController],
      providers: [
        {
          provide: DELIVERY_REPOSITORY,
          useValue: repository,
        },
      ],
    }).compile();

    controller = module.get<LocalDeliveryController>(LocalDeliveryController);
  });

  it('should return the delivery record for an existing processing request id', async () => {
    const record = new DeliveryRecord();
    record.eventId = 'evt-1';
    record.processingRequestId = 'req-1';
    record.ownerUserId = 'user-1';
    record.status = 'COMPLETED';
    record.recordedAt = new Date('2026-08-27T00:00:00Z');
    repository.findByProcessingRequestId.mockResolvedValue(record);

    const result = await controller.findByProcessingRequestId('req-1');

    expect(repository.findByProcessingRequestId).toHaveBeenCalledWith('req-1');
    expect(result).toBe(record);
  });

  it('should throw NotFoundException when the processing request id is not found', async () => {
    repository.findByProcessingRequestId.mockResolvedValue(undefined);

    await expect(
      controller.findByProcessingRequestId('missing'),
    ).rejects.toThrow(NotFoundException);
  });
});
