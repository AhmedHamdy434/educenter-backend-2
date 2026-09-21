import { ExecutionContext, BadRequestException } from '@nestjs/common';
import { getCenterIdFromContext } from './current-center-id.decorator';
import type { RequestUser } from '../../modules/auth/interfaces/authenticated-request.interface';

describe('CurrentCenterId Decorator', () => {
  function createMockExecutionContext(
    user?: Partial<RequestUser> | null,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should return centerId when present on request user', () => {
    const context = createMockExecutionContext({
      id: 'user-1',
      centerId: 'center-123',
    });

    const result = getCenterIdFromContext(null, context);
    expect(result).toBe('center-123');
  });

  it('should throw BadRequestException when centerId is null or undefined', () => {
    const contextWithNull = createMockExecutionContext({
      id: 'user-1',
      centerId: null,
    });

    expect(() => getCenterIdFromContext(null, contextWithNull)).toThrow(
      new BadRequestException('المستخدم الحالي غير مرتبط بأي مركز تعليمي.'),
    );

    const contextWithNoUser = createMockExecutionContext(null);
    expect(() => getCenterIdFromContext(null, contextWithNoUser)).toThrow(
      new BadRequestException('المستخدم الحالي غير مرتبط بأي مركز تعليمي.'),
    );
  });
});
