import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import session from 'express-session';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './platform/http/filters/all-exceptions.filter';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
    console.log(`Starting bootstrap... [${new Date().toISOString()}]`);

    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bufferLogs: false,
    });

    // 🔥 REQUIRED behind nginx (for secure cookies)
    app.set('trust proxy', 1);

    const configService = app.get(ConfigService);
    const port = Number(process.env.PORT) || 3000;
    const corsOrigin = configService.get<string>('CORS_ORIGIN', 'https://cockpit.ripun.site,https://cockpit.run');
    const allowedOrigins = corsOrigin.split(',').map(o => o.trim());
    const cookieSecure = configService.get<boolean | string>('COOKIE_SECURE', true);
    const sessionCookieSecure = cookieSecure === true || cookieSecure === 'true';
    const sessionCookieSameSite = configService.get<'lax' | 'strict' | 'none'>('COOKIE_SAMESITE', 'lax');

    // Serve public files
    app.useStaticAssets(join(process.cwd(), 'public'));

    // Logger
    app.useLogger(app.get(Logger));

    // Security headers
    app.use(helmet());

    // Cookie parser
    app.use(cookieParser());

    // ✅ SESSION MIDDLEWARE (THIS WAS MISSING)
    app.use(
        session({
            name: 'sid',
            secret: process.env.SESSION_SECRET || 'change-this-secret',
            resave: false,
            saveUninitialized: false,
            proxy: true, // important when behind proxy
            cookie: {
                httpOnly: true,
                secure: sessionCookieSecure,
                sameSite: sessionCookieSameSite,
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            },
        }),
    );

    // CORS with credentials
    app.enableCors({
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'x-csrf-token', 'Authorization'],
    });

    // Validation
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );

    // Global exception filter
    app.useGlobalFilters(new AllExceptionsFilter());

    // Swagger
    const swaggerConfig = new DocumentBuilder()
        .setTitle('Cockpit Production API')
        .setDescription('NestJS API for Cockpit & Cocktail')
        .setVersion('1.0')
        .addCookieAuth('sid')
        .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);

    // WebSocket adapter
    app.useWebSocketAdapter(new WsAdapter(app));

    await app.listen(port, '0.0.0.0');

    console.log(`🚀 Server running on port ${port}`);
}

bootstrap();
