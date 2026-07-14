import { Body, Controller, Post, UseGuards, Request, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { CocktailService } from './cocktail.service';
import { CocktailAuthGuard } from './cocktail.auth';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('Cocktail Device')
@Controller('cockpit/cocktail/device')
@SkipThrottle()
export class CocktailDeviceController {
    constructor(private readonly cocktailService: CocktailService) { }

    @Post('enroll/finish')
    @ApiOperation({ summary: 'Finish device enrollment' })
    async finishEnrollment(@Body() body: any) {
        return this.cocktailService.finishEnrollment(body);
    }

    @Post('heartbeat')
    @UseGuards(CocktailAuthGuard)
    @ApiHeader({ name: 'x-device-id' })
    @ApiHeader({ name: 'x-signature' })
    @ApiHeader({ name: 'x-ts' })
    @ApiHeader({ name: 'x-nonce' })
    @ApiOperation({ summary: 'Device heartbeat' })
    async heartbeat(@Request() req: any, @Body() body: any) {
        return this.cocktailService.updateHeartbeat(req.device.id, body);
    }

    @Post('metrics')
    @UseGuards(CocktailAuthGuard)
    @ApiHeader({ name: 'x-device-id' })
    @ApiOperation({ summary: 'Report metrics' })
    async metrics(@Request() req: any, @Body() body: any) {
        return this.cocktailService.saveMetrics(req.device.id, body);
    }

    @Post('tasks/poll')
    @UseGuards(CocktailAuthGuard)
    @ApiHeader({ name: 'x-device-id' })
    @ApiOperation({ summary: 'Poll for tasks' })
    async pollTasks(@Request() req: any, @Body() body: { maxTasks?: number }) {
        return this.cocktailService.pollTasks(req.device.id, body.maxTasks);
    }

    @Post('tasks/:taskId/status')
    @UseGuards(CocktailAuthGuard)
    @ApiHeader({ name: 'x-device-id' })
    @ApiOperation({ summary: 'Update task status' })
    async updateTaskStatus(@Request() req: any, @Param('taskId') taskId: string, @Body() body: any) {
        return this.cocktailService.updateTaskStatus(req.device.id, taskId, body);
    }
}
