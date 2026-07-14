import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import { CookieService } from '../cookies/cookie.service';

@Injectable()
export class CsrfService {
    constructor(private readonly cookieService: CookieService) { }

    generateToken(): string {
        return randomBytes(32).toString('hex');
    }

    rotateCsrfToken(res: Response): string {
        const token = this.generateToken();
        this.cookieService.setCsrfCookie(res, token);
        return token;
    }

    validateToken(cookieToken: string | undefined, headerToken: string | undefined): boolean {
        if (!cookieToken || !headerToken) {
            return false;
        }
        // Constant-time comparison to prevent timing attacks
        if (cookieToken.length !== headerToken.length) {
            return false;
        }
        let result = 0;
        for (let i = 0; i < cookieToken.length; i++) {
            result |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
        }
        return result === 0;
    }
}
