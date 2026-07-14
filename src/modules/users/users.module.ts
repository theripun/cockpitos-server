import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { HttpModule } from '../../platform/http/http.module';
import { PlatformAuthModule } from '../../platform/auth/auth.module';
import { SecurityModule } from '../../platform/security/security.module';
import { PasskeysService } from '../auth/passkeys/passkeys.service';
import { WebauthnService } from '../auth/passkeys/webauthn.service';

@Module({
    imports: [HttpModule, PlatformAuthModule, SecurityModule],
    controllers: [UsersController],
    providers: [UsersService, PasskeysService, WebauthnService],
    exports: [UsersService],
})
export class UsersModule { }