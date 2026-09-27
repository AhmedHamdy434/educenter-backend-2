import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { ExcelModule } from '../../shared/excel/excel.module';
import { PdfModule } from '../../shared/pdf/pdf.module';

@Module({
  imports: [ExcelModule, PdfModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
