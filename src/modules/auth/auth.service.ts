import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SuperAdmin } from '@prisma/client';
import {
  comparePassword,
  hashPassword,
} from '../../common/utils/password.util';
import { UsersService, UserWithCenter } from '../users/users.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AppRole } from '../../common/enums/app-role.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * للتحقق من صحة بيانات اعتماد مستخدمي السنتر (OWNER, ADMIN, TEACHER, STUDENT).
   * يرمي UnauthorizedException إذا كانت البيانات خاطئة أو الحساب غير نشط.
   */
  private async validateCenterUser(
    identifier: string,
    pass: string,
  ): Promise<UserWithCenter> {
    const user = await this.usersService.findByIdentifier(identifier);
    if (!user) {
      throw new UnauthorizedException('بيانات الاعتماد غير صالحة');
    }

    const isPasswordValid = await comparePassword(pass, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('بيانات الاعتماد غير صالحة');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('بيانات الاعتماد غير صالحة');
    }

    return user;
  }

  /**
   * للتحقق من صحة بيانات اعتماد المدير العام للمنصة (SUPER_ADMIN).
   * يرمي UnauthorizedException إذا كانت البيانات خاطئة أو الحساب غير نشط.
   */
  private async validateSuperAdmin(
    email: string,
    pass: string,
  ): Promise<SuperAdmin> {
    const superAdmin = await this.prisma.superAdmin.findUnique({
      where: { email },
    });

    if (!superAdmin) {
      throw new UnauthorizedException('بيانات الاعتماد غير صالحة');
    }

    const isPasswordValid = await comparePassword(pass, superAdmin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('بيانات الاعتماد غير صالحة');
    }

    if (!superAdmin.isActive) {
      throw new UnauthorizedException('بيانات الاعتماد غير صالحة');
    }

    return superAdmin;
  }

  /**
   * توليد رمز الوصول JWT للمستخدم أو المدير العام.
   */
  private generateTokens(user: {
    id: string;
    role: JwtPayload['role'];
    centerId?: string | null;
  }): { accessToken: string } {
    const payload: JwtPayload = {
      sub: user.id,
      centerId: user.centerId,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
    };
  }

  /**
   * تسجيل الدخول لمستخدمي المراكز التعليمية (OWNER, ADMIN, TEACHER, STUDENT).
   */
  async login(loginDto: LoginDto) {
    const user = await this.validateCenterUser(
      loginDto.identifier,
      loginDto.password,
    );
    const { accessToken } = this.generateTokens({
      id: user.id,
      role: user.role,
      centerId: user.centerId,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        centerId: user.centerId,
        mustChangePassword: user.mustChangePassword,
        center: user.center,
      },
    };
  }

  /**
   * تسجيل الدخول للمدير العام للنظام (SUPER_ADMIN).
   */
  async superAdminLogin(loginDto: LoginDto) {
    const superAdmin = await this.validateSuperAdmin(
      loginDto.identifier,
      loginDto.password,
    );
    const { accessToken } = this.generateTokens({
      id: superAdmin.id,
      role: AppRole.SUPER_ADMIN,
      centerId: null,
    });

    return {
      accessToken,
      user: {
        id: superAdmin.id,
        fullName: superAdmin.fullName,
        email: superAdmin.email,
        phone: null,
        role: AppRole.SUPER_ADMIN,
        centerId: null,
        mustChangePassword: false,
      },
    };
  }

  /**
   * استرجاع بيانات الملف الشخصي لـ GET /auth/me.
   */
  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('بيانات الاعتماد غير صالحة');
    }

    return user;
  }

  /**
   * استرجاع بيانات الملف الشخصي للمدير العام (Super Admin) لـ GET /auth/super-admin/me.
   */
  async getSuperAdminProfile(adminId: string) {
    const superAdmin = await this.prisma.superAdmin.findUnique({
      where: { id: adminId },
    });

    if (!superAdmin || !superAdmin.isActive) {
      throw new UnauthorizedException(
        'بيانات الاعتماد غير صالحة أو الحساب غير نشط',
      );
    }

    return {
      id: superAdmin.id,
      fullName: superAdmin.fullName,
      email: superAdmin.email,
      phone: null,
      role: 'SUPER_ADMIN' as const,
      centerId: null,
      mustChangePassword: false,
    };
  }

  /**
   * تغيير كلمة المرور للمستخدم الحالي بعد التحقق من كلمة المرور الحالية.
   */
  async changePassword(
    userId: string,
    role: AppRole | 'SUPER_ADMIN',
    dto: ChangePasswordDto,
  ) {
    if (role === AppRole.SUPER_ADMIN) {
      const superAdmin = await this.prisma.superAdmin.findUnique({
        where: { id: userId },
      });
      if (!superAdmin) {
        throw new UnauthorizedException('المستخدم غير موجود.');
      }
      const isValid = await comparePassword(
        dto.currentPassword,
        superAdmin.password,
      );
      if (!isValid) {
        throw new BadRequestException('كلمة المرور الحالية غير صحيحة.');
      }
      const newHashed = await hashPassword(dto.newPassword);
      await this.prisma.superAdmin.update({
        where: { id: userId },
        data: { password: newHashed },
      });
      return { success: true, message: 'تم تغيير كلمة المرور بنجاح.' };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) {
      throw new UnauthorizedException('المستخدم غير موجود.');
    }

    const isValid = await comparePassword(dto.currentPassword, user.password);
    if (!isValid) {
      throw new BadRequestException('كلمة المرور الحالية غير صحيحة.');
    }

    const newHashed = await hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: newHashed,
        mustChangePassword: false,
      },
    });

    return { success: true, message: 'تم تغيير كلمة المرور بنجاح.' };
  }

  /**
   * طلب استعادة كلمة المرور عبر توليد رمز OTP صالح لمدة 10 دقائق.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ message: string; otp?: string }> {
    const superAdmin = await this.prisma.superAdmin.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    const user = !superAdmin
      ? await this.prisma.user.findUnique({
          where: { email: dto.email },
          select: { id: true },
        })
      : null;

    // إذا لم يكن البريد موجوداً، نعيد رسالة نجاح عامة لمنع User Enumeration
    if (!superAdmin && !user) {
      return {
        message:
          'إذا كان البريد الإلكتروني مسجلاً لدينا، فستصلك رسالة تحتوي على رمز التحقق.',
      };
    }

    // توليد رمز OTP مكون من 6 أرقام
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 دقائق

    await this.prisma.passwordResetToken.create({
      data: {
        email: dto.email,
        otp,
        expiresAt,
      },
    });

    return {
      message:
        'إذا كان البريد الإلكتروني مسجلاً لدينا، فستصلك رسالة تحتوي على رمز التحقق.',
      otp: process.env.NODE_ENV === 'production' ? undefined : otp,
    };
  }

  /**
   * إعادة تعيين كلمة المرور باستخدام رمز الـ OTP.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        email: dto.email,
        otp: dto.otp,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw new BadRequestException('رمز التحقق غير صالح أو انتهت صلاحيته.');
    }

    const newHashed = await hashPassword(dto.newPassword);

    const superAdmin = await this.prisma.superAdmin.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (superAdmin) {
      await this.prisma.superAdmin.update({
        where: { id: superAdmin.id },
        data: { password: newHashed },
      });
    } else {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });

      if (!user) {
        throw new BadRequestException('المستخدم غير موجود.');
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          password: newHashed,
          mustChangePassword: false,
        },
      });
    }

    // تعليم الرمز كمستخدم
    await this.prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { used: true },
    });

    return { message: 'تم إعادة تعيين كلمة المرور بنجاح.' };
  }
}
