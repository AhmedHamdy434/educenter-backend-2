import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { formatIndentedBody, safeSerializeAndRedact } from './redact.util';

function getHttpStatusName(statusCode: number): string {
  const name = HttpStatus[statusCode];
  if (!name) return '';
  if (name === 'OK') return 'OK';
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly configService: ConfigService,
    httpAdapterHost?: HttpAdapterHost,
  ) {
    super(httpAdapterHost?.httpAdapter);
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    try {
      if (host.getType() === 'http' && this.isLoggingEnabled()) {
        const http = host.switchToHttp();
        const request = http.getRequest<Request & { _startTime?: number }>();

        const method = request?.method || 'UNKNOWN';
        const url = request?.originalUrl || request?.url || 'UNKNOWN';

        const startTime = request?._startTime;
        const duration = startTime ? `${Date.now() - startTime}ms` : '';

        const statusCode =
          exception instanceof HttpException
            ? exception.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;

        const statusName = getHttpStatusName(statusCode);
        const format = this.getLoggingFormat();

        const errorPayload =
          exception instanceof HttpException
            ? exception.getResponse()
            : {
                statusCode: 500,
                message:
                  exception instanceof Error
                    ? exception.message
                    : 'Internal server error',
              };

        const maxBodyLength = this.getMaxBodyLength();
        const redactFields = this.getRedactFields();

        let logMessage: string;

        if (format === 'pretty') {
          const formattedPayload = safeSerializeAndRedact(
            errorPayload,
            maxBodyLength,
            redactFields,
            true,
          );
          const durationStr = duration ? ` (${duration})` : '';
          const statusPart = statusName
            ? `${statusCode} ${statusName}`
            : `${statusCode}`;
          logMessage = `${method} ${url} → ${statusPart}${durationStr}\n${formatIndentedBody(formattedPayload)}`;
        } else {
          logMessage = `${method} ${url} ${statusCode} ${statusName}`.trim();
          if (duration) {
            logMessage += ` - ${duration}`;
          }
          const formattedPayload = safeSerializeAndRedact(
            errorPayload,
            maxBodyLength,
            redactFields,
            false,
          );
          logMessage += ` - Body: ${formattedPayload}`;
        }

        if (statusCode >= 500) {
          this.logger.error(
            logMessage,
            exception instanceof Error ? exception.stack : undefined,
          );
        } else {
          this.logger.warn(logMessage);
        }
      }
    } catch (loggingErr) {
      try {
        this.logger.warn(
          `Failed to log exception: ${loggingErr instanceof Error ? loggingErr.message : 'Unknown error'}`,
        );
      } catch {
        // Failsafe: Never allow logging issues to prevent super.catch
      }
    }

    super.catch(exception, host);
  }

  private isLoggingEnabled(): boolean {
    const envVal = this.configService.get<string | boolean>(
      'HTTP_LOGGING_ENABLED',
    );
    if (envVal !== undefined && envVal !== null) {
      return String(envVal).toLowerCase() === 'true';
    }
    return process.env.NODE_ENV !== 'production';
  }

  private getMaxBodyLength(): number {
    const len = this.configService.get<string | number>(
      'HTTP_LOGGING_MAX_BODY_LENGTH',
    );
    if (len !== undefined && len !== null) {
      const parsed = Number(len);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 1000;
  }

  private getRedactFields(): string[] {
    const fields = this.configService.get<string>('HTTP_LOGGING_REDACT_FIELDS');
    if (!fields) {
      return [];
    }
    return fields
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
  }

  private getLoggingFormat(): 'pretty' | 'compact' {
    const format = this.configService
      .get<string>('HTTP_LOGGING_FORMAT')
      ?.toLowerCase();
    if (format === 'pretty' || format === 'compact') {
      return format;
    }
    return process.env.NODE_ENV === 'production' ? 'compact' : 'pretty';
  }
}
