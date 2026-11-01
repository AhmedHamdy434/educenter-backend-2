import { Module } from '@nestjs/common';
import { SubscriptionPlansModule } from '../subscription-plans/subscription-plans.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ExtraSessionsService } from './extra-sessions.service';
import { ExtraSessionsReminderService } from './extra-sessions.reminder.service';
import { GroupExtraSessionsController } from './group-extra-sessions.controller';
import { ExtraSessionsController } from './extra-sessions.controller';

@Module({
  imports: [SubscriptionPlansModule, NotificationsModule, AuditLogsModule],
  controllers: [GroupExtraSessionsController, ExtraSessionsController],
  providers: [ExtraSessionsService, ExtraSessionsReminderService],
  exports: [ExtraSessionsService],
})
export class ExtraSessionsModule {}
