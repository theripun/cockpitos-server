import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { COOKIE_NAMES } from './cookie.constants';

type SameSite = 'lax' | 'strict' | 'none';

@Injectable()
export class CookieService {
    private readonly secure: boolean;
    private readonly sameSite: SameSite;
    private readonly domain?: string;
    private readonly sessionTtlSeconds: number;

    constructor(private readonly configService: ConfigService) {
        const envSameSite = this.configService.get<string>('COOKIE_SAMESITE', 'lax').toLowerCase();
        const cookieSecure = this.configService.get<boolean | string>('COOKIE_SECURE', false);
        this.secure = cookieSecure === true || cookieSecure === 'true';
        this.sameSite = (envSameSite === 'none' || envSameSite === 'strict' ? envSameSite : 'lax') as SameSite;
        this.domain = this.configService.get<string>('COOKIE_DOMAIN') || undefined;
        this.sessionTtlSeconds = parseInt(
            this.configService.get<string>('SESSION_TTL_SECONDS', '604800'),
            10,
        );
        console.log(`[CookieService] Configured: Secure=${this.secure}, SameSite=${this.sameSite}, Domain=${this.domain || 'host-only'}`);
    }

    setSessionCookie(res: Response, sessionId: string): void {
        res.cookie(COOKIE_NAMES.SESSION, sessionId, {
            httpOnly: true,
            secure: this.secure,
            sameSite: this.sameSite,
            domain: this.domain,
            path: '/',
            maxAge: this.sessionTtlSeconds * 1000,
        });
    }

    clearSessionCookie(res: Response): void {
        res.clearCookie(COOKIE_NAMES.SESSION, {
            httpOnly: true,
            secure: this.secure,
            sameSite: this.sameSite,
            domain: this.domain,
            path: '/',
        });
    }

    setCsrfCookie(res: Response, token: string): void {
        res.cookie(COOKIE_NAMES.CSRF, token, {
            httpOnly: false, // Client needs to read this for header
            secure: this.secure,
            sameSite: this.sameSite,
            domain: this.domain,
            path: '/',
            maxAge: this.sessionTtlSeconds * 1000,
        });
    }

    clearCsrfCookie(res: Response): void {
        res.clearCookie(COOKIE_NAMES.CSRF, {
            httpOnly: false,
            secure: this.secure,
            sameSite: this.sameSite,
            domain: this.domain,
            path: '/',
        });
    }
}
