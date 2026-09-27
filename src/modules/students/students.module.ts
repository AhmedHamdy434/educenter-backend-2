import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { UsersModule } from '../users/users.module';
import { SubscriptionPlansModule } from '../subscription-plans/subscription-plans.module';
import { ExcelModule } from '../../shared/excel/excel.module';
import { PdfModule } from '../../shared/pdf/pdf.module';

@Module({
  imports: [UsersModule, SubscriptionPlansModule, ExcelModule, PdfModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
