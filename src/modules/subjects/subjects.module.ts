import { Module } from '@nestjs/common';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';
import { SubscriptionPlansModule } from '../subscription-plans/subscription-plans.module';
import { ExcelModule } from '../../shared/excel/excel.module';
import { PdfModule } from '../../shared/pdf/pdf.module';

@Module({
  imports: [SubscriptionPlansModule, ExcelModule, PdfModule],
  controllers: [SubjectsController],
  providers: [SubjectsService],
  exports: [SubjectsService],
})
export class SubjectsModule {}

