import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../modules/auth/interfaces/authenticated-request.interface';

/**
 * دمج استخراج الـ centerId من المستخدم المصادق مع التحقق من وجوده.
 * يرمي BadRequestException فوراً إذا لم يكن المستخدم مرتبطاً بأي مركز.
 */
export const getCenterIdFromContext = (
  _data: unknown,
  ctx: ExecutionContext,
): string => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  const centerId = request.user?.centerId;

  if (!centerId) {
    throw new BadRequestException('المستخدم الحالي غير مرتبط بأي مركز تعليمي.');
  }

  return centerId;
};

export const CurrentCenterId = createParamDecorator(getCenterIdFromContext);
