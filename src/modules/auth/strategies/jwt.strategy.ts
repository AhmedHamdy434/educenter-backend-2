import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AppRole } from '../../../common/enums/app-role.enum';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import type { RequestUser } from '../interfaces/authenticated-request.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    if (payload.role === AppRole.SUPER_ADMIN) {
      const superAdmin = await this.prisma.superAdmin.findUnique({
        where: { id: payload.sub },
      });

      if (!superAdmin || !superAdmin.isActive) {
        throw new UnauthorizedException(
          'تم تعطيل هذا الحساب أو لم يعد صالحاً للاستخدام.',
        );
      }

      return {
        id: superAdmin.id,
        centerId: null,
        role: AppRole.SUPER_ADMIN,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'تم تعطيل هذا الحساب أو لم يعد صالحاً للاستخدام.',
      );
    }

    return {
      id: user.id,
      centerId: user.centerId,
      role: user.role,
    };
  }
}
