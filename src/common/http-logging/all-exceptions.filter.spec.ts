import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let configService: jest.Mocked<ConfigService>;
  let httpAdapterHost: HttpAdapterHost;
  let mockHttpAdapter: any;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    mockHttpAdapter = {
      reply: jest.fn(),
      isHeadersSent: jest.fn().mockReturnValue(false),
      end: jest.fn(),
    };

    httpAdapterHost = {
      httpAdapter: mockHttpAdapter,
    } as unknown as HttpAdapterHost;

    filter = new AllExceptionsFilter(configService, httpAdapterHost);

    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createMockArgumentsHost(
    request: any = { method: 'POST', originalUrl: '/api/auth/login' },
    response: any = {},
  ): ArgumentsHost {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getArgByIndex: (index: number) => {
        if (index === 0) return request;
        if (index === 1) return response;
        return undefined;
      },
    } as unknown as ArgumentsHost;
  }

  it('should log HttpException in compact mode with redacted payload and delegate to super.catch', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'true';
      if (key === 'HTTP_LOGGING_FORMAT') return 'compact';
      return undefined;
    });

    const host = createMockArgumentsHost({
      method: 'POST',
      originalUrl: '/api/auth/login',
      _startTime: Date.now() - 15,
    });

    const exception = new HttpException(
      {
        statusCode: 401,
        message: 'Invalid credentials',
        password: 'secretPassword',
      },
      HttpStatus.UNAUTHORIZED,
    );

    filter.catch(exception, host);

    // Verify warning log for 4xx errors
    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    const logMsg = loggerWarnSpy.mock.calls[0][0];
    expect(logMsg).toContain('POST /api/auth/login 401 Unauthorized');
    expect(logMsg).toContain('Body:');
    expect(logMsg).toContain('Invalid credentials');
    expect(logMsg).toContain('[REDACTED]');
    expect(logMsg).not.toContain('secretPassword');

    // Verify super.catch delegated to httpAdapter.reply
    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        statusCode: 401,
        message: 'Invalid credentials',
      }),
      401,
    );
  });

  it('should log HttpException in pretty mode with arrow header and indented body', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'true';
      if (key === 'HTTP_LOGGING_FORMAT') return 'pretty';
      return undefined;
    });

    const host = createMockArgumentsHost({
      method: 'POST',
      originalUrl: '/api/auth/login',
      _startTime: Date.now() - 15,
    });

    const exception = new HttpException(
      {
        statusCode: 401,
        message: 'بيانات الاعتماد غير صالحة',
        password: 'secretPassword',
      },
      HttpStatus.UNAUTHORIZED,
    );

    filter.catch(exception, host);

    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    const logMsg = loggerWarnSpy.mock.calls[0][0];
    expect(logMsg).toMatch(
      /^POST \/api\/auth\/login → 401 Unauthorized \(\d+ms\)/,
    );
    expect(logMsg).toContain('\n  Body: {');
    expect(logMsg).toContain('    "statusCode": 401,');
    expect(logMsg).toContain('    "message": "بيانات الاعتماد غير صالحة",');
    expect(logMsg).toContain('    "password": "[REDACTED]"');
    expect(logMsg).not.toContain('secretPassword');
    // Ensure Arabic text is not escaped
    expect(logMsg).not.toContain('\\u');
  });

  it('should log 500 error with error level in compact mode and delegate to super.catch', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'true';
      if (key === 'HTTP_LOGGING_FORMAT') return 'compact';
      return undefined;
    });

    const host = createMockArgumentsHost({
      method: 'GET',
      originalUrl: '/api/crash',
    });

    const exception = new Error('Database connection failed');

    filter.catch(exception, host);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/crash 500 Internal Server Error'),
      expect.anything(),
    );

    // Verify super.catch handled unknown error
    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
      }),
      500,
    );
  });

  it('should log 500 error with error level in pretty mode', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'true';
      if (key === 'HTTP_LOGGING_FORMAT') return 'pretty';
      return undefined;
    });

    const host = createMockArgumentsHost({
      method: 'GET',
      originalUrl: '/api/crash',
    });

    const exception = new Error('Database connection failed');

    filter.catch(exception, host);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^GET \/api\/crash → 500 Internal Server Error/),
      expect.anything(),
    );
  });

  it('should bypass logging if HTTP_LOGGING_ENABLED is false but still call super.catch', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'false';
      return undefined;
    });

    const host = createMockArgumentsHost();
    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    filter.catch(exception, host);

    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      403,
    );
  });

  it('should still call super.catch even if logging throws an unexpected error', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'HTTP_LOGGING_ENABLED') return 'true';
      return undefined;
    });

    // Make logger.warn throw inside logging try-block
    loggerWarnSpy.mockImplementation(() => {
      throw new Error('Logger crashed');
    });

    const host = createMockArgumentsHost();
    const exception = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);

    expect(() => filter.catch(exception, host)).not.toThrow();
    expect(mockHttpAdapter.reply).toHaveBeenCalled();
  });
});
