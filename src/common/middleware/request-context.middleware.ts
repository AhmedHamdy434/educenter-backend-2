import { Injectable, NestMiddleware } from '@nestjs/common';
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
  constructor(private readonly jwtService: JwtService) {}

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
        const decoded = this.jwtService.decode<JwtPayload>(token);
        if (decoded && typeof decoded === 'object' && 'sub' in decoded) {
          context = {
            userId: decoded.sub,
            role: decoded.role,
            centerId: decoded.centerId || null,
            isSuperAdmin: decoded.role === AppRole.SUPER_ADMIN,
          };
        }
      } catch {
        // Invalid or unparseable token; proceed with empty context
      }
    }

    requestContextStorage.run(context, () => {
      next();
    });
  }
}
