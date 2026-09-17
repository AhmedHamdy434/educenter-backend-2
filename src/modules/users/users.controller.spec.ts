import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SubscriptionValidationService } from '../subscription-plans/subscription-validation.service';
import { AppRole } from '../../common/enums/app-role.enum';
import { UserQueryDto } from './dto/get-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { BadRequestException } from '@nestjs/common';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<Partial<UsersService>>;

  beforeEach(async () => {
    usersService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: SubscriptionValidationService,
          useValue: {
            validateSubscriptionAccess: jest.fn(),
            validateActiveSubscription: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should find users for center', async () => {
      const mockUser = {
        id: 'owner-1',
        role: AppRole.OWNER,
        centerId: 'center-1',
      };

      const query = new UserQueryDto();
      (usersService.findAll as jest.Mock).mockResolvedValueOnce({
        data: [{ id: 'u-1', fullName: 'User 1' }],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });

      const result = await controller.findAll(mockUser, query);

      expect(usersService.findAll).toHaveBeenCalledWith('center-1', query);
      expect(result.data.length).toBe(1);
    });

    it('should throw BadRequestException if centerId missing', async () => {
      const mockUser = {
        id: 'admin-1',
        role: AppRole.SUPER_ADMIN,
        centerId: null,
      };

      await expect(
        controller.findAll(mockUser, new UserQueryDto()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should find single user', async () => {
      const mockUser = {
        id: 'owner-1',
        role: AppRole.OWNER,
        centerId: 'center-1',
      };

      (usersService.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'u-1',
        fullName: 'User 1',
      });

      const result = await controller.findOne(mockUser, 'u-1');

      expect(usersService.findOne).toHaveBeenCalledWith('center-1', 'u-1');
      expect(result.id).toBe('u-1');
    });
  });

  describe('update', () => {
    it('should update user', async () => {
      const mockUser = {
        id: 'owner-1',
        role: AppRole.OWNER,
        centerId: 'center-1',
      };

      const dto: UpdateUserDto = { fullName: 'Updated Name' };

      (usersService.update as jest.Mock).mockResolvedValueOnce({
        id: 'u-1',
        fullName: 'Updated Name',
      });

      const result = await controller.update(mockUser, 'u-1', dto);

      expect(usersService.update).toHaveBeenCalledWith(
        'center-1',
        'u-1',
        dto,
        mockUser,
      );
      expect(result.fullName).toBe('Updated Name');
    });
  });
});
