import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule as CronScheduleModule } from '@nestjs/schedule';
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
import { SubscriptionPaymentsModule } from './modules/subscription-payments/subscription-payments.module';
import { HomeStatsModule } from './modules/home-stats/home-stats.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { ExtraSessionsModule } from './modules/extra-sessions/extra-sessions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CronScheduleModule.forRoot(),
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
    ScheduleModule,
    ExtraSessionsModule,
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
