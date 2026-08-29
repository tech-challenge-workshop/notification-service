import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('LocalDeliveryController disabled (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('does not expose the local route when LOCAL_INTEGRATION is unset', async () => {
    const response = await request(app.getHttpServer()).get(
      '/local/deliveries/req-1',
    );

    expect(response.status).toBe(404);
    expect((response.body as { message: string }).message).toMatch(
      /^Cannot GET \//,
    );
  });
});
