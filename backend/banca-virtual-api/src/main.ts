import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  for (const name of ['JWT_SECRET', 'ENCRYPTION_KEY', 'SERVICE_API_KEY']) {
    const value = process.env[name] ?? '';
    if (value.startsWith('cambia-esto') || value.length < 24) {
      logger.warn(`${name} tiene el valor de ejemplo o es muy corto: genera uno aleatorio antes de usar datos reales.`);
    }
  }
  if (!process.env.CORE_API_KEY) logger.warn('CORE_API_KEY está vacío: las solicitudes de productos fallarán.');

  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  if (process.env.SWAGGER_ENABLED !== 'false') {
    const doc = new DocumentBuilder()
      .setTitle('Banca Virtual API')
      .setDescription('API de la banca virtual. Consume el motor de evaluaciones CreditPulse (CORE).')
      .setVersion('0.1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'X-Service-Key', in: 'header' }, 'service-key')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  logger.log(`API lista en http://localhost:${port}/api/v1  (docs: /docs)`);
}

bootstrap();
