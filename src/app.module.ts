import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter, LoggingInterceptor } from './common/http-logging';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { PrismaModule } from './database/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SubscriptionPlansModule } from './modules/subscription-plans/subscription-plans.module';
import { CentersModule } from './modules/centers/centers.module';
import { StorageModule } from './shared/storage/storage.module';
import { GradesModule } from './modules/grades/grades.module';
import { SubjectsModule } from './modules/subjects/subjects.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { StudentsModule } from './modules/students/students.module';
import { GroupsModule } from './modules/groups/groups.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { ParentPortalModule } from './modules/parent-portal/parent-portal.module';
import { SubscriptionPaymentsModule } from './modules/subscription-payments/subscription-payments.module';
import { HomeStatsModule } from './modules/home-stats/home-stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    JwtModule.register({ global: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    SubscriptionPlansModule,
    CentersModule,
    SubscriptionPaymentsModule,
    HomeStatsModule,
    StorageModule,
    GradesModule,
    SubjectsModule,
    TeachersModule,
    StudentsModule,
    GroupsModule,
    AttendanceModule,
    PaymentsModule,
    NotificationsModule,
    AuditLogsModule,
    ParentPortalModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
