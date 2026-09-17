import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { PrismaModule } from './database/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SubscriptionPlansModule } from './modules/subscription-plans/subscription-plans.module';
import { CentersModule } from './modules/centers/centers.module';
import { CloudinaryModule } from './shared/cloudinary/cloudinary.module';
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
    CloudinaryModule,
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
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
