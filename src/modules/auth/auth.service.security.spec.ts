import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppRole } from '../../common/enums/app-role.enum';
import { hashPassword } from '../../common/utils/password.util';
import { UnauthorizedException } from '@nestjs/common';
import type { SuperAdmin } from '@prisma/client';
import type { UserWithCenter } from '../users/users.service';

describe('Auth Security & Endpoint Separation Tests', () => {
  let authService: AuthService;
  const mockSuperAdminFindUnique = jest.fn();
  const mockUserFindByIdentifier = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockPrisma = {
      superAdmin: {
        findUnique: mockSuperAdminFindUnique,
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const mockUsersService = {
      findById: jest.fn(),
      findByIdentifier: mockUserFindByIdentifier,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UsersService, useValue: mockUsersService },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('test-jwt-token'),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('Center Users Login (/auth/login)', () => {
    it('should authenticate center user (OWNER/TEACHER/ADMIN/STUDENT)', async () => {
      const email = 'owner@center.com';
      const userPassword = await hashPassword('UserPassword456');

      const userRecord: UserWithCenter = {
        id: 'user-1',
        fullName: 'Center Owner',
        email,
        password: userPassword,
        role: 'OWNER',
        centerId: 'center-1',
        phone: null,
        avatar: null,
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        center: {
          id: 'center-1',
          name: 'Center One',
          slug: 'center-one',
        },
      };

      mockUserFindByIdentifier.mockResolvedValue(userRecord);

      const result = await authService.login({
        identifier: email,
        password: 'UserPassword456',
      });

      expect(result).toBeDefined();
      expect(result.user.role).toBe(AppRole.OWNER);
      expect(result.user.id).toBe('user-1');
      expect(result.user.centerId).toBe('center-1');
      expect(result.user.center).toEqual({
        id: 'center-1',
        name: 'Center One',
        slug: 'center-one',
      });
      expect(mockSuperAdminFindUnique).not.toHaveBeenCalled();
    });

    it('should reject login if center user is inactive', async () => {
      const email = 'inactive@center.com';
      const userPassword = await hashPassword('Password123');

      const inactiveUser: UserWithCenter = {
        id: 'user-2',
        fullName: 'Inactive User',
        email,
        password: userPassword,
        role: 'TEACHER',
        centerId: 'center-1',
        phone: null,
        avatar: null,
        isActive: false,
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        center: {
          id: 'center-1',
          name: 'Center One',
          slug: 'center-one',
        },
      };

      mockUserFindByIdentifier.mockResolvedValue(inactiveUser);

      await expect(
        authService.login({
          identifier: email,
          password: 'Password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject login if password does not match', async () => {
      const userPassword = await hashPassword('CorrectPassword123');

      mockUserFindByIdentifier.mockResolvedValue({
        id: 'user-3',
        fullName: 'Teacher',
        email: 'teacher@center.com',
        password: userPassword,
        role: 'TEACHER',
        centerId: 'center-1',
        phone: null,
        avatar: null,
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        center: {
          id: 'center-1',
          name: 'Center One',
          slug: 'center-one',
        },
      });

      await expect(
        authService.login({
          identifier: 'teacher@center.com',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Super Admin Login (/auth/super-admin/login)', () => {
    it('should authenticate valid active SuperAdmin', async () => {
      const email = 'superadmin@system.local';
      const adminPassword = await hashPassword('SuperSecret123');

      const superAdminRecord: SuperAdmin = {
        id: 'super-admin-1',
        fullName: 'Super Admin',
        email,
        password: adminPassword,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSuperAdminFindUnique.mockResolvedValue(superAdminRecord);

      const result = await authService.superAdminLogin({
        identifier: email,
        password: 'SuperSecret123',
      });

      expect(result).toBeDefined();
      expect(result.user.role).toBe(AppRole.SUPER_ADMIN);
      expect(result.user.id).toBe('super-admin-1');
      expect(result.user.centerId).toBeNull();
      expect(mockUserFindByIdentifier).not.toHaveBeenCalled();
    });

    it('should reject super admin login if account is inactive', async () => {
      const email = 'inactive-admin@system.local';
      const adminPassword = await hashPassword('SuperSecret123');

      mockSuperAdminFindUnique.mockResolvedValue({
        id: 'super-admin-2',
        fullName: 'Inactive Super Admin',
        email,
        password: adminPassword,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        authService.superAdminLogin({
          identifier: email,
          password: 'SuperSecret123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject super admin login if email is not found in SuperAdmin table', async () => {
      mockSuperAdminFindUnique.mockResolvedValue(null);

      await expect(
        authService.superAdminLogin({
          identifier: 'regularuser@center.com',
          password: 'Password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
