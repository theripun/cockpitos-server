import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfService } from './csrf.service';
import { COOKIE_NAMES } from '../cookies/cookie.constants';
import { RequestWithUser } from '../../http/types/request-context.type';
import { ErrorCodes } from '../../../common/constants/error-codes';

export const CSRF_EXEMPT_KEY = 'csrf_exempt';

@Injectable()
export class CsrfGuard implements CanActivate {
    private readonly mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

    constructor(
        private readonly csrfService: CsrfService,
        private readonly reflector: Reflector,
    ) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<RequestWithUser>();
        const method = request.method.toUpperCase();

        // Only check CSRF for mutating methods
        if (!this.mutatingMethods.includes(method)) {
            return true;
        }

        // Check if endpoint is exempt
        const isExempt = this.reflector.getAllAndOverride<boolean>(CSRF_EXEMPT_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isExempt) {
            return true;
        }

        const cookieToken = request.cookies?.[COOKIE_NAMES.CSRF];
        const headerToken = request.headers['x-csrf-token'] as string | undefined;

        if (!this.csrfService.validateToken(cookieToken, headerToken)) {
            throw new ForbiddenException({
                code: ErrorCodes.CSRF_INVALID,
                message: 'Invalid CSRF token',
            });
        }

        return true;
    }
}
