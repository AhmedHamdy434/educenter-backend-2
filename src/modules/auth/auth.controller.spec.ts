import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    superAdminLogin: jest.Mock;
    getProfile: jest.Mock;
    changePassword: jest.Mock;
    forgotPassword: jest.Mock;
    resetPassword: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      superAdminLogin: jest.fn(),
      getProfile: jest.fn(),
      changePassword: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call authService.login on login endpoint', async () => {
    const dto = { identifier: 'teacher@example.com', password: 'Password123' };
    const expected = { accessToken: 'token', user: { id: '1' } };
    authService.login.mockResolvedValue(expected);

    const result = await controller.login(dto);
    expect(authService.login).toHaveBeenCalledWith(dto);
    expect(result).toBe(expected);
  });

  it('should call authService.superAdminLogin on super-admin/login endpoint', async () => {
    const dto = {
      identifier: 'superadmin@system.local',
      password: 'AdminPassword123',
    };
    const expected = { accessToken: 'sa-token', user: { id: 'sa-1' } };
    authService.superAdminLogin.mockResolvedValue(expected);

    const result = await controller.superAdminLogin(dto);
    expect(authService.superAdminLogin).toHaveBeenCalledWith(dto);
    expect(result).toBe(expected);
  });
});
