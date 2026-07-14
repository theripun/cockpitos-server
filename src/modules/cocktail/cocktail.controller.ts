import { Body, Controller, Delete, Get, Param, Post, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CocktailService } from './cocktail.service';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('Cocktail User')
@Controller('cockpit/cocktail')
@UseGuards(SessionGuard)
@ApiBearerAuth()
@SkipThrottle()
export class CocktailController {
    constructor(private readonly cocktailService: CocktailService) { }

    @Post('devices/enroll/start')
    @ApiOperation({ summary: 'Start device enrollment' })
    async startEnrollment(@Request() req: any, @Body() body: { vpsId: string }) {
        return this.cocktailService.startEnrollment(req.user.id, body.vpsId);
    }

    @Get('devices')
    @ApiOperation({ summary: 'List user devices' })
    async getDevices(@Request() req: any) {
        return this.cocktailService.getDevices(req.user.id);
    }

    @Get('devices/:deviceId')
    @ApiOperation({ summary: 'Get device details' })
    async getDevice(@Request() req: any, @Param('deviceId') deviceId: string) {
        return this.cocktailService.getDevice(req.user.id, deviceId);
    }

    @Post('devices/:deviceId/disable')
    @ApiOperation({ summary: 'Disable device' })
    async disableDevice(@Request() req: any, @Param('deviceId') deviceId: string) {
        return this.cocktailService.disableDevice(req.user.id, deviceId);
    }

    @Delete('devices/:deviceId')
    @ApiOperation({ summary: 'Permanently delete a device and all its data' })
    async deleteDevice(@Request() req: any, @Param('deviceId') deviceId: string) {
        return this.cocktailService.deleteDevice(req.user.id, deviceId);
    }

    @Post('devices/:deviceId/tasks')
    @ApiOperation({ summary: 'Create task for device' })
    async createTask(@Request() req: any, @Param('deviceId') deviceId: string, @Body() body: { type: string, payload: any }) {
        return this.cocktailService.createTask(req.user.id, deviceId, body.type, body.payload);
    }

    @Get('devices/:deviceId/tasks')
    @ApiOperation({ summary: 'List tasks for device' })
    async listTasks(@Request() req: any, @Param('deviceId') deviceId: string, @Query('limit') limit: number) {
        return this.cocktailService.listTasks(req.user.id, deviceId, limit ? Number(limit) : 50);
    }

    @Get('devices/:deviceId/metrics/latest')
    @ApiOperation({ summary: 'Get latest metrics for device' })
    async getLatestMetrics(@Request() req: any, @Param('deviceId') deviceId: string) {
        return this.cocktailService.getLatestMetrics(req.user.id, deviceId);
    }

    @Post('devices/:deviceId/proc/list')
    @ApiOperation({ summary: 'List processes for device' })
    async getProcessList(@Request() req: any, @Param('deviceId') deviceId: string, @Body() body: { limit?: number, sort?: string, descending?: boolean }) {
        return this.cocktailService.getProcessList(req.user.id, deviceId, body);
    }

    @Post('devices/:deviceId/proc/kill')
    @ApiOperation({ summary: 'Kill a process on device' })
    async killProcess(@Request() req: any, @Param('deviceId') deviceId: string, @Body() body: { pid: number, signal?: string, force?: boolean }) {
        return this.cocktailService.killProcess(req.user.id, deviceId, body.pid, body.signal || 'SIGTERM', body.force || false);
    }

    @Post('devices/:deviceId/boost/run')
    @ApiOperation({ summary: 'Run system booster tasks' })
    async runBooster(@Request() req: any, @Param('deviceId') deviceId: string, @Body() body: { actions: string[], dryRun?: boolean }) {
        return this.cocktailService.runBooster(req.user.id, deviceId, body.actions, body.dryRun || false);
    }
}
