import {
  Controller,
  Post,
  Patch,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from './interfaces/authenticated-request.interface';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم تسجيل الدخول بنجاح.')
  @ApiOperation({
    summary: 'تسجيل الدخول لمستخدمي المراكز التعليمية (مالك، معلم، طالب)',
  })
  @ApiResponse({
    status: 200,
    description: 'تم تسجيل الدخول وإرجاع رمز الوصول',
  })
  @ApiResponse({ status: 400, description: 'بيانات الطلب غير صالحة' })
  @ApiResponse({
    status: 401,
    description: 'بيانات الاعتماد غير صالحة أو الحساب غير نشط',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('super-admin/login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم تسجيل الدخول بنجاح.')
  @ApiOperation({ summary: 'تسجيل الدخول للمدير العام للمنصة (Super Admin)' })
  @ApiResponse({
    status: 200,
    description: 'تم تسجيل الدخول وإرجاع رمز الوصول',
  })
  @ApiResponse({ status: 400, description: 'بيانات الطلب غير صالحة' })
  @ApiResponse({
    status: 401,
    description: 'بيانات الاعتماد غير صالحة أو الحساب غير نشط',
  })
  async superAdminLogin(@Body() loginDto: LoginDto) {
    return this.authService.superAdminLogin(loginDto);
  }

  @Get('super-admin/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ResponseMessage('تم استرجاع بيانات الملف الشخصي بنجاح.')
  @ApiOperation({
    summary: 'استرجاع بيانات الملف الشخصي للمدير العام للمنصة (Super Admin)',
  })
  @ApiResponse({ status: 200, description: 'تم استرجاع البيانات بنجاح' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)',
  })
  async getSuperAdminMe(@CurrentUser() user: RequestUser) {
    return this.authService.getSuperAdminProfile(user.id);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  @ApiBearerAuth('JWT-auth')
  @ResponseMessage('تم استرجاع بيانات الملف الشخصي بنجاح.')
  @ApiOperation({ summary: 'استرجاع بيانات الملف الشخصي للمستخدم الحالي' })
  @ApiResponse({ status: 200, description: 'تم استرجاع البيانات بنجاح' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  async getMe(@CurrentUser() user: RequestUser) {
    return this.authService.getProfile(user.id);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم تغيير كلمة المرور بنجاح.')
  @ApiOperation({ summary: 'تغيير كلمة المرور للمستخدم الحالي' })
  @ApiResponse({ status: 200, description: 'تم تغيير كلمة المرور بنجاح' })
  @ApiResponse({ status: 400, description: 'بيانات التحقق غير صالحة' })
  @ApiResponse({
    status: 401,
    description: 'غير مصرح أو كلمة المرور الحالية غير صحيحة',
  })
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, user.role, dto);
  }

  @Post('forgot-password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم معالجة طلب استعادة كلمة المرور.')
  @ApiOperation({ summary: 'طلب إرسال رمز OTP لاستعادة كلمة المرور' })
  @ApiResponse({
    status: 200,
    description: 'تم إرسال رمز التحقق في حال وجود البريد',
  })
  @ApiResponse({ status: 400, description: 'صيغة البريد الإلكتروني غير صالحة' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم إعادة تعيين كلمة المرور بنجاح.')
  @ApiOperation({ summary: 'إعادة تعيين كلمة المرور باستخدام رمز OTP' })
  @ApiResponse({
    status: 200,
    description: 'تمت إعادة تعيين كلمة المرور بنجاح',
  })
  @ApiResponse({
    status: 400,
    description: 'رمز التحقق غير صحيح أو منتهي أو كلمة المرور غير صالحة',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
