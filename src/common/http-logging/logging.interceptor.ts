import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { formatIndentedBody, safeSerializeAndRedact } from './redact.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const isEnabled = this.isLoggingEnabled();
    if (!isEnabled) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { _startTime?: number }>();
    const response = http.getResponse<Response>();

    const startTime = Date.now();
    request._startTime = startTime;

    const method = request.method;
    const url = request.originalUrl || request.url;

    return next.handle().pipe(
      tap({
        next: (body: unknown) => {
          try {
            const duration = Date.now() - startTime;
            const statusCode = response.statusCode || 200;
            const statusMessage = response.statusMessage || '';

            const level = this.getLoggingLevel();
            const format = this.getLoggingFormat();

            let logMessage: string;

            if (format === 'pretty') {
              logMessage = `${method} ${url} → ${statusCode} (${duration}ms)`;
              if (level === 'verbose') {
                const maxBodyLength = this.getMaxBodyLength();
                const redactFields = this.getRedactFields();
                const formattedBody = safeSerializeAndRedact(
                  body,
                  maxBodyLength,
                  redactFields,
                  true,
                );
                logMessage += `\n${formatIndentedBody(formattedBody)}`;
              }
            } else {
              logMessage =
                `${method} ${url} ${statusCode} ${statusMessage}`.trim();
              logMessage += ` - ${duration}ms`;

              if (level === 'verbose') {
                const maxBodyLength = this.getMaxBodyLength();
                const redactFields = this.getRedactFields();
                const formattedBody = safeSerializeAndRedact(
                  body,
                  maxBodyLength,
                  redactFields,
                  false,
                );
                logMessage += ` - Body: ${formattedBody}`;
              }
            }

            this.logger.log(logMessage);
          } catch (err) {
            this.logger.warn(
              `Failed to log response: ${err instanceof Error ? err.message : 'Unknown error'}`,
            );
          }
        },
      }),
    );
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

  private getLoggingLevel(): 'basic' | 'verbose' {
    const level = this.configService
      .get<string>('HTTP_LOGGING_LEVEL')
      ?.toLowerCase();
    if (level === 'basic' || level === 'verbose') {
      return level;
    }
    return process.env.NODE_ENV === 'production' ? 'basic' : 'verbose';
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
