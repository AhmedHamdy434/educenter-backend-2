import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SubscriptionValidationService } from './subscription-validation.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('SubscriptionValidationService', () => {
  let service: SubscriptionValidationService;
  let prisma: {
    centerSubscription: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    student: {
      count: jest.Mock;
    };
    teacher: {
      count: jest.Mock;
    };
    subject: {
      count: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      centerSubscription: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      student: {
        count: jest.fn(),
      },
      teacher: {
        count: jest.fn(),
      },
      subject: {
        count: jest.fn(),
      },
    };
    service = new SubscriptionValidationService(
      prisma as unknown as PrismaService,
    );
  });

  describe('validateSubscriptionAccess & validateActiveSubscription', () => {
    it('should throw ForbiddenException with CENTER_SUBSCRIPTION_INACTIVE code if no subscription exists', async () => {
      prisma.centerSubscription.findFirst.mockResolvedValueOnce(null);

      try {
        await service.validateActiveSubscription('center-1');
        fail('Expected ForbiddenException to be thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const forbiddenErr = err as ForbiddenException;
        expect(forbiddenErr.getResponse()).toEqual({
          statusCode: 403,
          message:
            'المركز لا يمتلك اشتراكاً نشطاً حالياً. يرجى الاشتراك في إحدى الباقات.',
          error: 'Forbidden',
          code: 'CENTER_SUBSCRIPTION_INACTIVE',
        });
      }
    });

    it('should allow access within 3-day grace period and return warning header', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24); // 1 day past endDate
      const mockPlan = { id: 'plan-1', name: 'Free', isActive: true };
      prisma.centerSubscription.findFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'EXPIRED',
        endDate: pastDate,
        subscriptionPlan: mockPlan,
        center: { isActive: true },
      });

      const result = await service.validateSubscriptionAccess(
        'center-1',
        false,
      );

      expect(result.isGracePeriod).toBe(true);
      expect(result.isExpired).toBe(false);
      expect(result.warningHeader).toContain('Grace period active');
      expect(result.subscriptionPlan).toEqual(mockPlan);

      // Verify no DB write occurred (read-only)
      expect(prisma.centerSubscription.update).not.toHaveBeenCalled();
    });

    it('should allow GET in read-only mode after grace period expires (> 3 days)', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5); // 5 days past endDate
      const mockPlan = { id: 'plan-1', name: 'Free', isActive: true };
      prisma.centerSubscription.findFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'EXPIRED',
        endDate: pastDate,
        subscriptionPlan: mockPlan,
        center: { isActive: true },
      });

      const result = await service.validateSubscriptionAccess('center-1', true);

      expect(result.isGracePeriod).toBe(false);
      expect(result.isExpired).toBe(true);
      expect(result.warningHeader).toBe(
        'Subscription expired. Read-only mode active.',
      );
      expect(result.subscriptionPlan).toEqual(mockPlan);
    });

    it('should throw ForbiddenException on write after grace period expires (> 3 days)', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5); // 5 days past endDate
      prisma.centerSubscription.findFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'EXPIRED',
        endDate: pastDate,
        subscriptionPlan: { id: 'plan-1', name: 'Free', isActive: true },
        center: { isActive: true },
      });

      await expect(
        service.validateSubscriptionAccess('center-1', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return subscription plan if subscription is active and not expired', async () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days later
      const mockPlan = {
        id: 'plan-1',
        name: 'Pro',
        studentLimit: 100,
        teacherLimit: 10,
        subjectLimit: 15,
        isActive: true,
      };

      prisma.centerSubscription.findFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'ACTIVE',
        endDate: futureDate,
        subscriptionPlan: mockPlan,
        center: { isActive: true },
      });

      const plan = await service.validateActiveSubscription('center-1');
      expect(plan).toEqual(mockPlan);
    });

    it('should throw ForbiddenException if subscription plan is inactive (isActive: false)', async () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
      prisma.centerSubscription.findFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'ACTIVE',
        endDate: futureDate,
        subscriptionPlan: {
          id: 'plan-1',
          name: 'Deactivated Plan',
          isActive: false,
        },
        center: { isActive: true },
      });

      await expect(
        service.validateSubscriptionAccess('center-1', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if center is inactive (center.isActive: false)', async () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
      prisma.centerSubscription.findFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'ACTIVE',
        endDate: futureDate,
        subscriptionPlan: {
          id: 'plan-1',
          name: 'Active Plan',
          isActive: true,
        },
        center: {
          isActive: false,
        },
      });

      await expect(
        service.validateSubscriptionAccess('center-1', false),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('limit checks', () => {
    const validSubscription = {
      id: 'sub-1',
      status: 'ACTIVE',
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      subscriptionPlan: {
        id: 'plan-1',
        name: 'Standard',
        studentLimit: 50,
        teacherLimit: 5,
        subjectLimit: 10,
        isActive: true,
      },
      center: { isActive: true },
    };

    it('should throw BadRequestException if student limit is reached', async () => {
      prisma.centerSubscription.findFirst.mockResolvedValue(validSubscription);
      prisma.student.count.mockResolvedValueOnce(50);

      await expect(service.validateStudentLimit('center-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should pass if student limit is not reached', async () => {
      prisma.centerSubscription.findFirst.mockResolvedValue(validSubscription);
      prisma.student.count.mockResolvedValueOnce(49);

      await expect(
        service.validateStudentLimit('center-1'),
      ).resolves.toBeUndefined();
    });

    it('should throw BadRequestException if teacher limit is reached', async () => {
      prisma.centerSubscription.findFirst.mockResolvedValue(validSubscription);
      prisma.teacher.count.mockResolvedValueOnce(5);

      await expect(service.validateTeacherLimit('center-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if subject limit is reached', async () => {
      prisma.centerSubscription.findFirst.mockResolvedValue(validSubscription);
      prisma.subject.count.mockResolvedValueOnce(10);

      await expect(service.validateSubjectLimit('center-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
