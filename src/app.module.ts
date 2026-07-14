import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { LoggingModule } from './platform/logging/logging.module';
import { HttpModule } from './platform/http/http.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { PlatformAuthModule } from './platform/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CockpitModule } from './modules/cockpit/cockpit.module';
import { CocktailModule } from './modules/cocktail/cocktail.module';
import { MailModule } from './modules/mail/mail.module';

import { CalendarModule } from './modules/calendar/calendar.module';
import { ActivityModule } from './modules/activity/activity.module';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
    imports: [
        ThrottlerModule.forRoot([{
            ttl: 60000,
            limit: 10,
        }]),
        // Core modules
        ConfigModule,
        LoggingModule,
        HttpModule,
        DbModule,
        // Feature modules
        HealthModule,
        AuthModule,
        PlatformAuthModule,
        UsersModule,
        CockpitModule,
        CocktailModule,
        MailModule,
        CalendarModule,
        ActivityModule,
    ],
    providers: [],
})
export class AppModule { }
