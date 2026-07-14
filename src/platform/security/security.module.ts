import { Module } from '@nestjs/common';
import { CsrfService } from './csrf/csrf.service';
import { CsrfGuard } from './csrf/csrf.guard';
import { CookieModule } from './cookies/cookie.module';
import { CookieService } from './cookies/cookie.service';

@Module({
  imports: [CookieModule],
  providers: [CsrfService, CsrfGuard, CookieService],
  exports: [CsrfService, CsrfGuard, CookieService],
})
export class SecurityModule {}