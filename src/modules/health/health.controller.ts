import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health')
@Controller()
export class HealthController {
    @Get()
    @ApiOperation({ summary: 'Health check' })
    @ApiResponse({ status: 200, description: 'Service is healthy' })
    check() {
        return {
            status: 'ok',
            service: 'api',
            timestamp: new Date().toISOString(),
        };
    }
}
