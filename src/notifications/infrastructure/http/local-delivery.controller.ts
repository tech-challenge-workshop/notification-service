import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { DeliveryRecord } from '../../domain/delivery-record';
import type { DeliveryRepository } from '../../domain/delivery.repository';
import { DELIVERY_REPOSITORY } from '../../domain/delivery-repository.token';

@Controller('local/deliveries')
export class LocalDeliveryController {
  constructor(
    @Inject(DELIVERY_REPOSITORY)
    private readonly deliveryRepository: DeliveryRepository,
  ) {}

  @Get(':processingRequestId')
  async findByProcessingRequestId(
    @Param('processingRequestId') processingRequestId: string,
  ): Promise<DeliveryRecord> {
    const record =
      await this.deliveryRepository.findByProcessingRequestId(
        processingRequestId,
      );
    if (!record) {
      throw new NotFoundException();
    }
    return record;
  }
}
