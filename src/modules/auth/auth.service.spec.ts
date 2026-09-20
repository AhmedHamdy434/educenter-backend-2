import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: {
    superAdmin: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    passwordResetToken: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      superAdmin: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn(),
            findByIdentifier: jest.fn(),
            create: jest.fn(),
            createUserAccount: jest.fn(),
            updateUserAccount: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-token'),
            decode: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('forgotPassword', () => {
    it('should generate OTP and return generic message if user exists', async () => {
      prismaMock.superAdmin.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
      });
      prismaMock.passwordResetToken.create.mockResolvedValueOnce({
        id: 'token-1',
      });

      const result = await service.forgotPassword({
        email: 'user@example.com',
      });

      expect(result.message).toContain('إذا كان البريد الإلكتروني مسجلاً');
      expect(prismaMock.passwordResetToken.create).toHaveBeenCalled();
    });

    it('should return generic message without creating token if user does not exist', async () => {
      prismaMock.superAdmin.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      const result = await service.forgotPassword({
        email: 'unknown@example.com',
      });

      expect(result.message).toContain('إذا كان البريد الإلكتروني مسجلاً');
      expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should reset password and mark token used when OTP is valid', async () => {
      prismaMock.passwordResetToken.findFirst.mockResolvedValueOnce({
        id: 'token-1',
        email: 'user@example.com',
        otp: '123456',
        used: false,
        expiresAt: new Date(Date.now() + 100000),
      });
      prismaMock.superAdmin.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
      });
      prismaMock.user.update.mockResolvedValueOnce({ id: 'user-1' });
      prismaMock.passwordResetToken.update.mockResolvedValueOnce({
        id: 'token-1',
        used: true,
      });

      const result = await service.resetPassword({
        email: 'user@example.com',
        otp: '123456',
        newPassword: 'NewPassword123',
      });

      expect(result.message).toBe('تم إعادة تعيين كلمة المرور بنجاح.');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            mustChangePassword: false,
          }) as unknown,
        }),
      );
      expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: { used: true },
      });
    });

    it('should throw BadRequestException if token is invalid or expired', async () => {
      prismaMock.passwordResetToken.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.resetPassword({
          email: 'user@example.com',
          otp: '000000',
          newPassword: 'NewPassword123',
        }),
      ).rejects.toThrow('رمز التحقق غير صالح أو انتهت صلاحيته.');
    });
  });

  describe('getSuperAdminProfile', () => {
    it('should return super admin profile if found and active', async () => {
      prismaMock.superAdmin.findUnique.mockResolvedValueOnce({
        id: 'sa-1',
        fullName: 'Super Admin',
        email: 'superadmin@system.local',
        isActive: true,
      });

      const result = await service.getSuperAdminProfile('sa-1');
      expect(prismaMock.superAdmin.findUnique).toHaveBeenCalledWith({
        where: { id: 'sa-1' },
      });
      expect(result).toEqual({
        id: 'sa-1',
        fullName: 'Super Admin',
        email: 'superadmin@system.local',
        phone: null,
        role: 'SUPER_ADMIN',
        centerId: null,
        mustChangePassword: false,
      });
    });

    it('should throw UnauthorizedException if super admin is not found', async () => {
      prismaMock.superAdmin.findUnique.mockResolvedValueOnce(null);

      await expect(service.getSuperAdminProfile('unknown')).rejects.toThrow(
        'بيانات الاعتماد غير صالحة أو الحساب غير نشط',
      );
    });

    it('should throw UnauthorizedException if super admin is inactive', async () => {
      prismaMock.superAdmin.findUnique.mockResolvedValueOnce({
        id: 'sa-1',
        fullName: 'Super Admin',
        email: 'superadmin@system.local',
        isActive: false,
      });

      await expect(service.getSuperAdminProfile('sa-1')).rejects.toThrow(
        'بيانات الاعتماد غير صالحة أو الحساب غير نشط',
      );
    });
  });
});
