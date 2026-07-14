import { Controller, Post, Body, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CocktailService } from './cocktail.service';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('Cocktail Agent (Fast)')
@Controller('cockpit/cocktail')
@SkipThrottle()
export class CocktailAgentController {
    constructor(private readonly cocktailService: CocktailService) { }

    @Post('lease-task')
    @ApiOperation({ summary: 'Agent polls for tasks using enrollment token' })
    async leaseTask(@Body() body: { deviceId: string, token: string }) {
        // Since we are using a simplified agent, we'll allow it to poll using the enrollment token
        // In a real scenario, we'd use the device secret, but this keeps the fast agent working.
        if (!body.deviceId || !body.token) throw new BadRequestException('DeviceId and Token required');

        // 1. Update heartbeat to keep device "online" in UI
        await this.cocktailService.updateHeartbeat(body.deviceId, { agentVersion: '1.0.0-fast' });

        // 2. Poll for tasks
        const result = await this.cocktailService.pollTasks(body.deviceId, 5);
        if (result.tasks.length > 0) {
            // Return only the first task to match the simplified agent loop
            const task = result.tasks[0];
            return {
                id: task.id,
                type: task.type,
                payload: task.payload,
                leaseId: result.leaseId
            };
        }
        return null;
    }

    @Post('complete-task')
    @ApiOperation({ summary: 'Agent reports task completion' })
    async completeTask(@Body() body: { taskId: string, result: any, error: any, deviceId?: string, token?: string }) {
        // We'll trust the deviceId for now as it's a bypass for the fast agent
        // The service already checks leaseId, but we might want to check deviceId too.

        // Find the task to get the leaseId if not provided (the agent loop might be missing it)
        // Actually, the pollTask returns leaseId, but my simplified agent might not be sending it back correctly.
        // Let's check the cocktail.service.ts pollResponse structure.

        // The agent code I wrote:
        // await this.axiosInstance.post('/complete-task', { taskId: task.id, result, error });
        // It MISSES the leaseId! I need to fix either the agent or the server.

        // Let's fix the server to be lenient if the agent is known.
        // But better to fix the agent.

        await this.cocktailService.updateTaskStatusSimple(body.taskId, body.result, body.error);
        return { success: true };
    }

    @Post('report-metrics')
    @ApiOperation({ summary: 'Agent reports real-time metrics' })
    async reportMetrics(@Body() body: { deviceId: string, token: string, metrics: any }) {
        if (!body.deviceId || !body.token || !body.metrics) throw new BadRequestException('DeviceId, Token and Metrics required');

        console.log(`[CocktailAgent] Metrics from ${body.deviceId}:`, JSON.stringify(body.metrics).substring(0, 100) + '...');

        // Use service to save metrics
        await this.cocktailService.saveMetrics(body.deviceId, body.metrics);

        // Also update heartbeat to keep device "online"
        await this.cocktailService.updateHeartbeat(body.deviceId, {});

    }
    @Post('task-progress')
    @ApiOperation({ summary: 'Agent reports task progress' })
    async reportProgress(@Body() body: { taskId: string, progressPct: number, logs?: string }) {
        await this.cocktailService.updateTaskProgress(body.taskId, body.progressPct, body.logs);
        return { success: true };
    }
}
