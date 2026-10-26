import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import {
  requestContextStorage,
  RequestContext,
} from '../context/request-context';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';
import { AppRole } from '../enums/app-role.enum';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    let context: RequestContext = {
      centerId: null,
      role: null,
      userId: null,
      isSuperAdmin: false,
    };

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const secret = this.configService.get<string>('JWT_SECRET');
        const payload = this.jwtService.verify<JwtPayload>(token, {
          secret,
          ignoreExpiration: false,
        });
        if (payload && typeof payload === 'object' && 'sub' in payload) {
          context = {
            userId: payload.sub,
            role: payload.role,
            centerId: payload.centerId || null,
            isSuperAdmin: payload.role === AppRole.SUPER_ADMIN,
          };
        }
      } catch {
        // Invalid, expired, untrusted, or unparseable token; proceed with empty context
      }
    }

    requestContextStorage.run(context, () => {
      next();
    });
  }
}
