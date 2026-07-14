import { Module } from '@nestjs/common';
import { TokenService } from './services/token.service';
import { BearerAuthGuard } from './guards/bearer-auth.guard';
import { AgentAuthGuard } from './guards/agent-auth.guard';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule],
  providers: [TokenService, BearerAuthGuard, AgentAuthGuard],
  exports: [TokenService, BearerAuthGuard, AgentAuthGuard],
})
export class PlatformAuthModule {}