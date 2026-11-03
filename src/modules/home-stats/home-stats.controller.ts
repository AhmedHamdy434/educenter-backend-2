import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { HomeStatsService } from './home-stats.service';
import { HomeStatsResponseDto } from './dto/home-stats-response.dto';

@Controller('home-stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class HomeStatsController {
  constructor(private readonly homeStatsService: HomeStatsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم جلب إحصائيات الصفحة الرئيسية بنجاح.')
  async getHomeStats(): Promise<HomeStatsResponseDto> {
    return this.homeStatsService.getHomeStats();
  }
}
