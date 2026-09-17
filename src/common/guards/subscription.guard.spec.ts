import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SubscriptionGuard } from './subscription.guard';
import { SubscriptionValidationService } from '../../modules/subscription-plans/subscription-validation.service';
import { AppRole } from '../enums/app-role.enum';
import type { RequestUser } from '../../modules/auth/interfaces/authenticated-request.interface';

describe('SubscriptionGuard', () => {
  let guard: SubscriptionGuard;
  let validationService: jest.Mocked<Partial<SubscriptionValidationService>>;

  beforeEach(() => {
    validationService = {
      validateSubscriptionAccess: jest.fn(),
      validateActiveSubscription: jest.fn(),
    };
    guard = new SubscriptionGuard(
      validationService as SubscriptionValidationService,
    );
  });

  function createMockExecutionContext(
    user?: Partial<RequestUser> | null,
    method: string = 'GET',
    setHeaderMock: jest.Mock = jest.fn(),
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          method,
        }),
        getResponse: () => ({
          setHeader: setHeaderMock,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow access if user has no centerId (e.g. SUPER_ADMIN)', async () => {
    const context = createMockExecutionContext({
      id: 'admin-1',
      role: AppRole.SUPER_ADMIN,
      centerId: null,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(validationService.validateSubscriptionAccess).not.toHaveBeenCalled();
  });

  it('should allow access if user center has an active subscription', async () => {
    (
      validationService.validateSubscriptionAccess as jest.Mock
    ).mockResolvedValueOnce({
      subscriptionPlan: { id: 'plan-1', name: 'Plan A' },
      isGracePeriod: false,
      isExpired: false,
    });

    const setHeaderMock = jest.fn();
    const context = createMockExecutionContext(
      {
        id: 'user-1',
        role: AppRole.OWNER,
        centerId: 'center-1',
      },
      'POST',
      setHeaderMock,
    );

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(validationService.validateSubscriptionAccess).toHaveBeenCalledWith(
      'center-1',
      false,
    );
    expect(setHeaderMock).not.toHaveBeenCalled();
  });

  it('should set warning header during 3-day grace period for read and write requests', async () => {
    (
      validationService.validateSubscriptionAccess as jest.Mock
    ).mockResolvedValueOnce({
      subscriptionPlan: { id: 'plan-1', name: 'Plan A' },
      isGracePeriod: true,
      isExpired: false,
      remainingGraceDays: 2,
      warningHeader: 'Grace period active. 2 days remaining.',
    });

    const setHeaderMock = jest.fn();
    const context = createMockExecutionContext(
      {
        id: 'user-1',
        role: AppRole.OWNER,
        centerId: 'center-1',
      },
      'POST',
      setHeaderMock,
    );

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(setHeaderMock).toHaveBeenCalledWith(
      'X-Subscription-Warning',
      'Grace period active. 2 days remaining.',
    );
  });

  it('should allow GET request in read-only mode after grace period expires', async () => {
    (
      validationService.validateSubscriptionAccess as jest.Mock
    ).mockResolvedValueOnce({
      subscriptionPlan: { id: 'plan-1', name: 'Plan A' },
      isGracePeriod: false,
      isExpired: true,
      warningHeader: 'Subscription expired. Read-only mode active.',
    });

    const setHeaderMock = jest.fn();
    const context = createMockExecutionContext(
      {
        id: 'user-1',
        role: AppRole.TEACHER,
        centerId: 'center-1',
      },
      'GET',
      setHeaderMock,
    );

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(validationService.validateSubscriptionAccess).toHaveBeenCalledWith(
      'center-1',
      true,
    );
  });

  it('should throw ForbiddenException on write requests when subscription is expired past grace period', async () => {
    (
      validationService.validateSubscriptionAccess as jest.Mock
    ).mockRejectedValueOnce(
      new ForbiddenException(
        'اشتراك السنتر منتهي، برجاء التجديد لاستكمال الإضافة والتعديل.',
      ),
    );

    const context = createMockExecutionContext(
      {
        id: 'user-1',
        role: AppRole.TEACHER,
        centerId: 'center-expired',
      },
      'POST',
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(validationService.validateSubscriptionAccess).toHaveBeenCalledWith(
      'center-expired',
      false,
    );
  });
});
