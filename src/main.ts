import * as fs from 'fs';
import * as path from 'path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const frontendUrls = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
    : [];

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('EduCenter API')
    .setDescription(
      'API documentation for EduCenter Multi-Tenant SaaS Platform',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  const openApiPath = path.join(process.cwd(), 'docs', 'openapi.json');
  if (fs.existsSync(openApiPath)) {
    try {
      const enrichedDoc = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
      for (const [pathKey, methods] of Object.entries(
        enrichedDoc.paths || {},
      )) {
        if (swaggerDocument.paths[pathKey]) {
          for (const [methodKey, op] of Object.entries(
            methods as Record<string, any>,
          )) {
            if (swaggerDocument.paths[pathKey][methodKey] && op.responses) {
              swaggerDocument.paths[pathKey][methodKey].responses =
                op.responses;
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to load docs/openapi.json', err);
    }
  }

  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  if (process.env.NODE_ENV !== 'production') {
    await app.listen(process.env.PORT || 3000);
  }

  console.log(
    `🚀 Server running on: http://localhost:${process.env.PORT ?? 3000}`,
  );
}

// Reload trigger - teachers & students updated
void bootstrap();
