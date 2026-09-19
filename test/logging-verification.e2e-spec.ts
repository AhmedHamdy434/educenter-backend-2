import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Logging Interceptor and AllExceptionsFilter E2E Verification', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. GET /api/subscription-plans - logs 200 OK with response body', async () => {
    const logSpy = jest.spyOn(
      require('@nestjs/common').Logger.prototype,
      'log',
    );
    const res = await request(app.getHttpServer())
      .get('/api/subscription-plans')
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    const matchingLog = logSpy.mock.calls.find((call) =>
      String(call[0]).includes('/api/subscription-plans'),
    );
    expect(matchingLog).toBeDefined();
  });

  it('2. POST /api/auth/login with invalid credentials - logs 401 Unauthorized with redacted password', async () => {
    const warnSpy = jest.spyOn(
      require('@nestjs/common').Logger.prototype,
      'warn',
    );
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        identifier: 'nonexistent@example.com',
        password: 'mySecretPassword123',
      })
      .expect(401);

    expect(res.body).toHaveProperty('statusCode', 401);
    expect(res.body).toHaveProperty('message');
    const matchingLog = warnSpy.mock.calls.find((call) =>
      String(call[0]).includes('/api/auth/login 401'),
    );
    expect(matchingLog).toBeDefined();
  });

  it('3. POST /api/auth/login with missing fields - logs 400 Bad Request with ValidationPipe array message', async () => {
    const warnSpy = jest.spyOn(
      require('@nestjs/common').Logger.prototype,
      'warn',
    );
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({})
      .expect(400);

    expect(res.body).toHaveProperty('statusCode', 400);
    expect(Array.isArray(res.body.message)).toBe(true);
    expect(res.body).toHaveProperty('error', 'Bad Request');
    const matchingLog = warnSpy.mock.calls.find((call) =>
      String(call[0]).includes('/api/auth/login 400'),
    );
    expect(matchingLog).toBeDefined();
  });
});
