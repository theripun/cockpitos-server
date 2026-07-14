import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithUser, RequestUser } from '../types/request-context.type';

export const CurrentUser = createParamDecorator(
    (data: keyof RequestUser | undefined, ctx: ExecutionContext): RequestUser | unknown => {
        const request = ctx.switchToHttp().getRequest<RequestWithUser>();
        const user = request.user;

        if (data) {
            return user?.[data];
        }

        return user;
    },
);
