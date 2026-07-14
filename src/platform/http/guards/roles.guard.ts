import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestWithUser } from '../types/request-context.type';
import { ErrorCodes } from '../../../common/constants/error-codes';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest<RequestWithUser>();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException({
                code: ErrorCodes.FORBIDDEN,
                message: 'Access denied',
            });
        }

        const hasRole = requiredRoles.includes(user.role);

        if (!hasRole) {
            throw new ForbiddenException({
                code: ErrorCodes.INSUFFICIENT_ROLE,
                message: `Required role: ${requiredRoles.join(' or ')}`,
            });
        }

        return true;
    }
}
