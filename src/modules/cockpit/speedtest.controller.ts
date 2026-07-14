import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import * as crypto from 'crypto';

@ApiTags('Cockpit')
@Controller('cockpit')
export class SpeedtestController {
    @Get('speedtest')
    @ApiOperation({ summary: 'Speed test endpoint - returns random bytes for bandwidth measurement' })
    @ApiQuery({ name: 'size', required: false, description: 'Size in bytes (default: 102400, max: 1048576)' })
    @ApiResponse({ status: 200, description: 'Random bytes for speed testing' })
    speedtest(
        @Query('size') sizeParam: string,
        @Res() res: Response,
    ) {
        // Default 100KB, max 1MB
        let size = parseInt(sizeParam) || 102400;
        size = Math.min(size, 1048576); // Cap at 1MB
        size = Math.max(size, 1024); // Min 1KB

        // Generate random bytes
        const data = crypto.randomBytes(size);

        // Set headers to prevent caching
        res.set({
            'Content-Type': 'application/octet-stream',
            'Content-Length': size.toString(),
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Speedtest-Size': size.toString(),
            'Access-Control-Expose-Headers': 'X-Speedtest-Size',
        });

        res.send(data);
    }
}
