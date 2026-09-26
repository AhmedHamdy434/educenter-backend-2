import { Module } from '@nestjs/common';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';
import { ExcelModule } from '../../shared/excel/excel.module';
import { PdfModule } from '../../shared/pdf/pdf.module';

@Module({
  imports: [ExcelModule, PdfModule],
  controllers: [GradesController],
  providers: [GradesService],
  exports: [GradesService],
})
export class GradesModule {}
