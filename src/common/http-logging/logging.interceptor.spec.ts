import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let configService: jest.Mocked<ConfigService>;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    interceptor = new LoggingInterceptor(configService);

    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createMockExecutionContext(
    method = 'GET',
    url = '/api/users/42',
    statusCode = 200,
    statusMessage = 'OK',
    type = 'http',
  ): ExecutionContext {
    const request = {
      method,
      url,
      originalUrl: url,
    };
    const response = {
      statusCode,
      statusMessage,
    };

    return {
      getType: () => type,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  it('should ignore non-http contexts', (done) => {
    const context = createMockExecutionContext(
      'GET',
      '/test',
      200,
      'OK',
      'rpc',
    );
    const callHandler: CallHandler = {
      handle: () => of({ data: 'ok' }),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: (val) => {
        expect(val).toEqual({ data: 'ok' });
        expect(loggerLogSpy).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should bypass logging if HTTP_LOGGING_ENABLED is false', (done) => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'false';
      return undefined;
    });

    const context = createMockExecutionContext();
    const callHandler: CallHandler = {
      handle: () => of({ success: true }),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: (val) => {
        expect(val).toEqual({ success: true });
        expect(loggerLogSpy).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log in compact mode without response body for basic level', (done) => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'true';
      if (key === 'HTTP_LOGGING_LEVEL') return 'basic';
      if (key === 'HTTP_LOGGING_FORMAT') return 'compact';
      return undefined;
    });

    const context = createMockExecutionContext(
      'POST',
      '/api/orders',
      201,
      'Created',
    );
    const callHandler: CallHandler = {
      handle: () => of({ id: 123, status: 'confirmed' }),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: (val) => {
        expect(val).toEqual({ id: 123, status: 'confirmed' });
        expect(loggerLogSpy).toHaveBeenCalledTimes(1);
        const logMsg = loggerLogSpy.mock.calls[0][0];
        expect(logMsg).toContain('POST /api/orders 201 Created');
        expect(logMsg).not.toContain('Body:');
        done();
      },
    });
  });

  it('should log in compact mode with single-line redacted response body', (done) => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'true';
      if (key === 'HTTP_LOGGING_LEVEL') return 'verbose';
      if (key === 'HTTP_LOGGING_FORMAT') return 'compact';
      if (key === 'HTTP_LOGGING_MAX_BODY_LENGTH') return '1000';
      if (key === 'HTTP_LOGGING_REDACT_FIELDS') return 'customSecret';
      return undefined;
    });

    const context = createMockExecutionContext(
      'GET',
      '/api/users/42',
      200,
      'OK',
    );
    const responsePayload = {
      id: 42,
      name: 'Jane Doe',
      password: 'superSecretPassword',
      customSecret: 'hiddenSecret',
    };

    const callHandler: CallHandler = {
      handle: () => of(responsePayload),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: (val) => {
        // Must not mutate the actual emitted value
        expect(val).toEqual(responsePayload);
        expect((val as any).password).toBe('superSecretPassword');

        // Verify logged message
        expect(loggerLogSpy).toHaveBeenCalledTimes(1);
        const logMsg = loggerLogSpy.mock.calls[0][0];
        expect(logMsg).toContain('GET /api/users/42 200 OK');
        expect(logMsg).toContain(
          ' - Body: {"id":42,"name":"Jane Doe","password":"[REDACTED]","customSecret":"[REDACTED]"}',
        );
        done();
      },
    });
  });

  it('should log in pretty mode with arrow header and indented body block', (done) => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'true';
      if (key === 'HTTP_LOGGING_LEVEL') return 'verbose';
      if (key === 'HTTP_LOGGING_FORMAT') return 'pretty';
      if (key === 'HTTP_LOGGING_MAX_BODY_LENGTH') return '1000';
      return undefined;
    });

    const context = createMockExecutionContext(
      'GET',
      '/api/auth/me',
      200,
      'OK',
    );
    const responsePayload = {
      success: true,
      message: 'تم استرجاع بيانات الملف الشخصي بنجاح.',
      data: {
        id: 'user-1',
        fullName: 'مصطفى السيد',
      },
    };

    const callHandler: CallHandler = {
      handle: () => of(responsePayload),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: () => {
        expect(loggerLogSpy).toHaveBeenCalledTimes(1);
        const logMsg = loggerLogSpy.mock.calls[0][0];
        expect(logMsg).toMatch(/^GET \/api\/auth\/me → 200 \(\d+ms\)/);
        expect(logMsg).toContain('\n  Body: {');
        expect(logMsg).toContain('    "success": true,');
        expect(logMsg).toContain(
          '    "message": "تم استرجاع بيانات الملف الشخصي بنجاح.",',
        );
        expect(logMsg).toContain('      "fullName": "مصطفى السيد"');
        done();
      },
    });
  });

  it('should log in pretty mode with arrow header without body for basic level', (done) => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'true';
      if (key === 'HTTP_LOGGING_LEVEL') return 'basic';
      if (key === 'HTTP_LOGGING_FORMAT') return 'pretty';
      return undefined;
    });

    const context = createMockExecutionContext(
      'POST',
      '/api/groups',
      201,
      'Created',
    );
    const callHandler: CallHandler = {
      handle: () => of({ success: true }),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: () => {
        expect(loggerLogSpy).toHaveBeenCalledTimes(1);
        const logMsg = loggerLogSpy.mock.calls[0][0];
        expect(logMsg).toMatch(/^POST \/api\/groups → 201 \(\d+ms\)$/);
        expect(logMsg).not.toContain('Body:');
        done();
      },
    });
  });

  it('should truncate response body when it exceeds HTTP_LOGGING_MAX_BODY_LENGTH', (done) => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'true';
      if (key === 'HTTP_LOGGING_LEVEL') return 'verbose';
      if (key === 'HTTP_LOGGING_FORMAT') return 'compact';
      if (key === 'HTTP_LOGGING_MAX_BODY_LENGTH') return '25';
      return undefined;
    });

    const context = createMockExecutionContext(
      'GET',
      '/api/large-data',
      200,
      'OK',
    );
    const largePayload = {
      description:
        'This is a long description that definitely exceeds 25 characters limit',
    };

    const callHandler: CallHandler = {
      handle: () => of(largePayload),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: (val) => {
        expect(val).toEqual(largePayload);
        expect(loggerLogSpy).toHaveBeenCalledTimes(1);
        const logMsg = loggerLogSpy.mock.calls[0][0];
        expect(logMsg).toContain('Body:');
        expect(logMsg).toContain('... [truncated]');
        done();
      },
    });
  });

  it('should handle logging errors gracefully without crashing or altering stream', (done) => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'true';
      if (key === 'HTTP_LOGGING_LEVEL') return 'verbose';
      return undefined;
    });

    // Cause logger.log to throw
    loggerLogSpy.mockImplementation(() => {
      throw new Error('Logger disk full');
    });

    const context = createMockExecutionContext();
    const callHandler: CallHandler = {
      handle: () => of({ ok: true }),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: (val) => {
        expect(val).toEqual({ ok: true });
        expect(loggerWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to log response: Logger disk full'),
        );
        done();
      },
    });
  });
});
