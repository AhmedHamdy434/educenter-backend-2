import { Module } from '@nestjs/common';
import { ExcelModule } from '../../shared/excel/excel.module';
import { TeacherSettlementsController } from './teacher-settlements.controller';
import { TeacherSettlementsService } from './teacher-settlements.service';

@Module({
  imports: [ExcelModule],
  controllers: [TeacherSettlementsController],
  providers: [TeacherSettlementsService],
  exports: [TeacherSettlementsService],
})
export class TeacherSettlementsModule {}
