import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { ActivityService } from './activity.service';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { CurrentUser } from '../../platform/http/decorators/current-user.decorator';
import { RequestUser } from '../../platform/http/types/request-context.type';
import { Request } from 'express';

@ApiTags('Activity')
@Controller('activity')
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class ActivityController {
    constructor(private readonly activityService: ActivityService) { }

    @Post('heartbeat')
    @ApiOperation({ summary: 'Send a heartbeat with current location' })
    @ApiResponse({ status: 200, description: 'Heartbeat recorded' })
    async heartbeat(
        @CurrentUser('id') userId: string,
        @Body() body: { page: string; latitude?: number; longitude?: number; accuracy?: number },
        @Req() req: Request,
    ) {
        const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];

        return this.activityService.handleHeartbeat(
            userId,
            body.page,
            body.latitude,
            body.longitude,
            body.accuracy,
            ipAddress,
            userAgent,
        );
    }
}
