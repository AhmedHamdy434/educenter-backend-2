import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma, UserRole } from '@prisma/client';
import { UserQueryDto } from './dto/get-users.dto';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: {
    $transaction: jest.Mock;
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
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
        create: jest.fn(),
        update: jest.fn(),
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated users for center', async () => {
      prismaService.user.count.mockResolvedValueOnce(1);
      prismaService.user.findMany.mockResolvedValueOnce([
        {
          id: 'u-1',
          fullName: 'User 1',
          role: UserRole.TEACHER,
          centerId: 'center-1',
        },
      ]);

      const query = new UserQueryDto();
      const result = await service.findAll('center-1', query);

      expect(prismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            centerId: 'center-1',
          }) as unknown,
        }),
      );
      expect(result.data.length).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return user details if found', async () => {
      prismaService.user.findFirst.mockResolvedValueOnce({
        id: 'u-1',
        fullName: 'User 1',
        centerId: 'center-1',
      });

      const result = await service.findOne('center-1', 'u-1');
      expect(result.id).toBe('u-1');
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaService.user.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne('center-1', 'unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update user if found within center', async () => {
      prismaService.user.findFirst.mockResolvedValueOnce({
        id: 'u-1',
        centerId: 'center-1',
        email: 'u1@test.com',
      });
      prismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        fullName: 'Updated Name',
        centerId: 'center-1',
      });
      prismaService.user.update.mockResolvedValueOnce({
        id: 'u-1',
        fullName: 'Updated Name',
      });

      const result = await service.update('center-1', 'u-1', {
        fullName: 'Updated Name',
      });

      expect(result.fullName).toBe('Updated Name');
    });

    it('should throw NotFoundException if user not found for center', async () => {
      prismaService.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.update('center-1', 'u-1', { fullName: 'Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('ensureEmailIsUnique', () => {
    it('should throw ConflictException if email exists on another user', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce({ id: 'other-user' });

      await expect(
        service.ensureEmailIsUnique(
          prismaService as unknown as Prisma.TransactionClient,
          'exists@test.com',
          'my-id',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should not throw if email belongs to the same user', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce({ id: 'my-id' });

      await expect(
        service.ensureEmailIsUnique(
          prismaService as unknown as Prisma.TransactionClient,
          'exists@test.com',
          'my-id',
        ),
      ).resolves.not.toThrow();
    });
  });
});
