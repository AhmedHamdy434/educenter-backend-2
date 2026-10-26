import { RequestContextMiddleware } from './request-context.middleware';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRequestContext } from '../context/request-context';
import { AppRole } from '../enums/app-role.enum';
import type { Request, Response, NextFunction } from 'express';

describe('RequestContextMiddleware', () => {
  let middleware: RequestContextMiddleware;
  let jwtService: JwtService;
  let configService: ConfigService;

  const validSecret = 'test-jwt-secret-key-12345';

  beforeEach(() => {
    jwtService = new JwtService();
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return validSecret;
        return undefined;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return validSecret;
        throw new Error(`Missing config ${key}`);
      }),
    } as unknown as ConfigService;

    middleware = new RequestContextMiddleware(jwtService, configService);
  });

  it('should set trusted context when a valid, correctly signed token is provided', (done) => {
    const token = jwtService.sign(
      { sub: 'user-1', role: AppRole.OWNER, centerId: 'center-1' },
      { secret: validSecret },
    );

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as unknown as Request;

    const res = {} as Response;
    const next: NextFunction = jest.fn(() => {
      const context = getRequestContext();
      expect(context).toBeDefined();
      expect(context?.userId).toBe('user-1');
      expect(context?.role).toBe(AppRole.OWNER);
      expect(context?.centerId).toBe('center-1');
      expect(context?.isSuperAdmin).toBe(false);
      done();
    });

    middleware.use(req, res, next);
  });

  it('should set isSuperAdmin to true only when token has SUPER_ADMIN role and valid signature', (done) => {
    const token = jwtService.sign(
      { sub: 'admin-1', role: AppRole.SUPER_ADMIN, centerId: null },
      { secret: validSecret },
    );

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as unknown as Request;

    const res = {} as Response;
    const next: NextFunction = jest.fn(() => {
      const context = getRequestContext();
      expect(context).toBeDefined();
      expect(context?.userId).toBe('admin-1');
      expect(context?.isSuperAdmin).toBe(true);
      expect(context?.centerId).toBeNull();
      done();
    });

    middleware.use(req, res, next);
  });

  it('should reject forged/wrongly-signed token and keep context untrusted/empty', (done) => {
    // Signed with an attacker secret, not our validSecret
    const forgedToken = jwtService.sign(
      { sub: 'attacker-1', role: AppRole.SUPER_ADMIN, centerId: null },
      { secret: 'wrong-attacker-secret' },
    );

    const req = {
      headers: {
        authorization: `Bearer ${forgedToken}`,
      },
    } as unknown as Request;

    const res = {} as Response;
    const next: NextFunction = jest.fn(() => {
      const context = getRequestContext();
      expect(context).toBeDefined();
      expect(context?.userId).toBeNull();
      expect(context?.role).toBeNull();
      expect(context?.centerId).toBeNull();
      expect(context?.isSuperAdmin).toBe(false);
      done();
    });

    middleware.use(req, res, next);
  });

  it('should reject expired token and keep context untrusted/empty', (done) => {
    const expiredToken = jwtService.sign(
      { sub: 'user-1', role: AppRole.OWNER, centerId: 'center-1' },
      { secret: validSecret, expiresIn: -10 }, // expired 10 seconds ago
    );

    const req = {
      headers: {
        authorization: `Bearer ${expiredToken}`,
      },
    } as unknown as Request;

    const res = {} as Response;
    const next: NextFunction = jest.fn(() => {
      const context = getRequestContext();
      expect(context).toBeDefined();
      expect(context?.userId).toBeNull();
      expect(context?.isSuperAdmin).toBe(false);
      done();
    });

    middleware.use(req, res, next);
  });

  it('should keep context untrusted when no authorization header is present', (done) => {
    const req = {
      headers: {},
    } as unknown as Request;

    const res = {} as Response;
    const next: NextFunction = jest.fn(() => {
      const context = getRequestContext();
      expect(context).toBeDefined();
      expect(context?.userId).toBeNull();
      expect(context?.centerId).toBeNull();
      expect(context?.isSuperAdmin).toBe(false);
      done();
    });

    middleware.use(req, res, next);
  });
});
