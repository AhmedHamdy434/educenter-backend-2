import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  BYPASS_INTERCEPTOR_KEY,
  RESPONSE_MESSAGE_KEY,
} from '../decorators/response-message.decorator';

export interface Response<T> {
  success: boolean;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, unknown> {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const bypass = this.reflector.getAllAndOverride<boolean>(
      BYPASS_INTERCEPTOR_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (bypass) {
      return next.handle();
    }

    const message = this.reflector.getAllAndOverride<string>(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((data: unknown) => {
        // إذا كانت الاستجابة مهيأة مسبقاً وبها success، يتم إرجاعها كما هي
        if (data && typeof data === 'object') {
          const dataObj = data as Record<string, unknown>;

          if ('success' in dataObj) {
            return dataObj;
          }

          // إذا كانت الاستجابة تحتوي على pagination أو بيانات إضافية (data و meta كـ مفاتيح أساسية)
          if ('data' in dataObj && 'meta' in dataObj) {
            return {
              success: true,
              message: message || 'تم جلب البيانات بنجاح.',
              ...dataObj,
            };
          }
        }

        return {
          success: true,
          message: message || 'العملية تمت بنجاح.',
          data: data === undefined ? null : data,
        };
      }),
    );
  }
}
