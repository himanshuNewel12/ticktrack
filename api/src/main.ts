import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SensitiveDataInterceptor } from './common/interceptors/sensitive-data.interceptor';
import { requestContext } from './common/request-context';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Newel Planner — Mobile App API')
    .setDescription('Endpoints used by the TickTrack mobile application')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cookieParser());

  // Per-request AsyncLocalStorage context for userId propagation to the Prisma audit middleware
  app.use((req: any, _res: any, next: () => void) => {
    requestContext.run({ userId: null, ip: req.ip ?? null }, next);
  });

  // Same URL shape as the main backend (/api/v1/...) so the app only needs a new base URL.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new SensitiveDataInterceptor());

  // Native apps don't send an Origin header, so CORS only matters for the Expo web build.
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization, X-Requested-With',
  });

  const port = process.env.PORT || 4002;
  await app.listen(port, '0.0.0.0');
  console.log(`Mobile app API running on port ${port} (NODE_ENV=${process.env.NODE_ENV})`);
  // Must be the same database as the main backend; logged without credentials so the two can be compared.
  console.log(`Database: ${describeDatabase(process.env.DATABASE_URL)}`);
}

function describeDatabase(url?: string): string {
  if (!url) return '(DATABASE_URL not set)';
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || '5432'}${u.pathname} (user ${u.username || '?'})`;
  } catch {
    return '(DATABASE_URL could not be parsed)';
  }
}
bootstrap();
