import { Module } from '@nestjs/common';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';
import { UsersModule } from '../users/users.module';
import { SubscriptionPlansModule } from '../subscription-plans/subscription-plans.module';
import { ExcelModule } from '../../shared/excel/excel.module';
import { PdfModule } from '../../shared/pdf/pdf.module';

@Module({
  imports: [UsersModule, SubscriptionPlansModule, ExcelModule, PdfModule],
  controllers: [TeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
