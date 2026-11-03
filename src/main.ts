import * as path from 'path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const uploadDirConfig = configService.get<string>('UPLOAD_DIR') || 'uploads';
  const uploadsPath = path.isAbsolute(uploadDirConfig)
    ? uploadDirConfig
    : path.resolve(process.cwd(), uploadDirConfig);

  // Serve static uploaded files under /uploads/
  app.useStaticAssets(uploadsPath, {
    prefix: '/uploads/',
    maxAge: '1d',
  });

  app.setGlobalPrefix('api');
  const frontendUrls = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
    : [];

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://educenter-dashboard-super-admin-2.vercel.app',
    'https://educenter-website-2-eight.vercel.app',
    'https://educenter-website.vercel.app',
    'https://educenter.vercel.app',
    ...frontendUrls,
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, Postman, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      const isAllowed =
        allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== 'production' &&
          /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
    ],
    exposedHeaders: ['X-Subscription-Warning'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    await app.listen(process.env.PORT || 3000);
  }

  console.log(
    `🚀 Server running on: http://localhost:${process.env.PORT ?? 3000}`,
  );
}

void bootstrap();
