import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UserRole, Prisma } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserQueryDto } from './dto/get-users.dto';

describe('Cross-Tenant Security & Privilege Escalation Tests', () => {
  let service: UsersService;
  let prismaService: {
    $transaction: jest.Mock;
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaService = {
      $transaction: jest.fn(
        <T>(cb: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
          cb(prismaService as unknown as Prisma.TransactionClient),
      ),
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('Cross-Tenant Isolation', () => {
    it('should strictly filter by tenant centerId in findAll', async () => {
      prismaService.user.count.mockResolvedValueOnce(1);
      prismaService.user.findMany.mockResolvedValueOnce([
        {
          id: 'user-center-a',
          fullName: 'Student A',
          centerId: 'center-A',
          role: UserRole.STUDENT,
        },
      ]);

      const query = new UserQueryDto();
      const result = await service.findAll('center-A', query);

      expect(prismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            centerId: 'center-A',
          }) as unknown,
        }),
      );
      expect(result.data[0].centerId).toBe('center-A');
    });

    it('should reject access (NotFoundException) when Center A requests a user belonging to Center B', async () => {
      // User exists in DB under center-B, but center-A is requesting
      prismaService.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.findOne('center-A', 'user-belonging-to-center-B'),
      ).rejects.toThrow(NotFoundException);

      expect(prismaService.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'user-belonging-to-center-B',
            centerId: 'center-A',
          }) as unknown,
        }),
      );
    });

    it('should prevent updating a user belonging to another center', async () => {
      prismaService.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.update(
          'center-A',
          'user-belonging-to-center-B',
          { fullName: 'Hacked' },
          { id: 'admin-a', role: UserRole.OWNER },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Privilege Escalation Protection', () => {
    it('should prevent an ADMIN from modifying or deactivating the center OWNER', async () => {
      prismaService.user.findFirst.mockResolvedValueOnce({
        id: 'owner-id',
        role: UserRole.OWNER,
        centerId: 'center-A',
      });

      await expect(
        service.update(
          'center-A',
          'owner-id',
          { isActive: false },
          { id: 'admin-id', role: UserRole.ADMIN },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent an ADMIN from modifying another ADMIN', async () => {
      prismaService.user.findFirst.mockResolvedValueOnce({
        id: 'admin-2-id',
        role: UserRole.ADMIN,
        centerId: 'center-A',
      });

      await expect(
        service.update(
          'center-A',
          'admin-2-id',
          { fullName: 'Tampered' },
          { id: 'admin-1-id', role: UserRole.ADMIN },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow an OWNER to modify any user in their center', async () => {
      prismaService.user.findFirst.mockResolvedValueOnce({
        id: 'admin-1-id',
        role: UserRole.ADMIN,
        centerId: 'center-A',
      });
      prismaService.user.findUnique.mockResolvedValue({
        id: 'admin-1-id',
        fullName: 'Updated by Owner',
        role: UserRole.ADMIN,
        centerId: 'center-A',
      });
      prismaService.user.update = jest.fn().mockResolvedValueOnce({
        id: 'admin-1-id',
        fullName: 'Updated by Owner',
        role: UserRole.ADMIN,
        centerId: 'center-A',
      });

      const result = await service.update(
        'center-A',
        'admin-1-id',
        { fullName: 'Updated by Owner' },
        { id: 'owner-id', role: UserRole.OWNER },
      );

      expect(result.fullName).toBe('Updated by Owner');
    });
  });
});
