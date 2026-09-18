import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { HomeStatsService } from './home-stats.service';
import { HomeStatsResponseDto } from './dto/home-stats-response.dto';

@ApiTags('Home Stats')
@ApiBearerAuth('JWT-auth')
@Controller('home-stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class HomeStatsController {
  constructor(private readonly homeStatsService: HomeStatsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم جلب إحصائيات الصفحة الرئيسية بنجاح.')
  @ApiOperation({
    summary:
      'جلب إحصائيات الكروت الرئيسية للمنصة (خاص بالمدير العام SUPER_ADMIN)',
  })
  @ApiResponse({
    status: 200,
    description: 'تم جلب إحصائيات الصفحة الرئيسية بنجاح',
    type: HomeStatsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)',
  })
  async getHomeStats(): Promise<HomeStatsResponseDto> {
    return this.homeStatsService.getHomeStats();
  }
}
