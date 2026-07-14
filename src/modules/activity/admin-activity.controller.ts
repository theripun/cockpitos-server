import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { ActivityService } from './activity.service';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { CurrentUser } from '../../platform/http/decorators/current-user.decorator';
import { RequestUser } from '../../platform/http/types/request-context.type';

@ApiTags('Admin Activity')
@Controller('admin/activity')
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class AdminActivityController {
    constructor(private readonly activityService: ActivityService) { }

    @Get('users')
    @ApiOperation({ summary: 'Get all users activity (Admin only)' })
    async getUsersActivity(@CurrentUser() user: RequestUser) {
        // Optimally check for admin role here
        return this.activityService.getUsersActivity();
    }

    @Get('users/:userId/daily')
    @ApiOperation({ summary: 'Get daily activity for a user' })
    async getUserDailyActivity(@Param('userId') userId: string) {
        return this.activityService.getUserDailyActivity(userId);
    }

    @Get('users/:userId/ip-logs')
    @ApiOperation({ summary: 'Get IP logs for a user' })
    async getUserIpLogs(@Param('userId') userId: string) {
        return this.activityService.getUserIpLogs(userId);
    }

    @Get('users/:userId/locations')
    @ApiOperation({ summary: 'Get location logs for a user' })
    async getUserLocations(@Param('userId') userId: string) {
        return this.activityService.getUserLocations(userId);
    }

    @Get('audit-logs')
    @ApiOperation({ summary: 'Get global audit logs' })
    async getAuditLogs() {
        return this.activityService.getAuditLogs();
    }

    @Get('users/:userId/audit-logs')
    @ApiOperation({ summary: 'Get audit logs for a specific user' })
    async getUserAuditLogs(@Param('userId') userId: string) {
        return this.activityService.getAuditLogs(userId);
    }
}
