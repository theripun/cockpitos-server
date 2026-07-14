import { Controller, Post, Body, UseGuards, Request, Param, BadRequestException, Put, Get, Res, StreamableFile, NotFoundException, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { CocktailService } from './cocktail.service';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { CocktailAuthGuard } from './cocktail.auth';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import * as fs from 'fs';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import { cocktailTransfers } from '@/db/drizzle/schema';

import { StorageService } from './storage.service';
import * as path from 'path';

@ApiTags('Cocktail Transfers')
@Controller('cockpit/cocktail')
@SkipThrottle()
export class CocktailTransfersController {
    constructor(
        private readonly cocktailService: CocktailService,
        private readonly storageService: StorageService
    ) { }

    @Post('transfers/upload/init')
    @UseGuards(SessionGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Initialize upload session (Browser -> Server)' })
    async initUpload(@Request() req: any, @Body() body: { deviceId: string, path: string, sizeBytes: number }) {
        if (!body.deviceId || !body.path) throw new BadRequestException('Missing deviceId or path');

        const transfer = await this.cocktailService.initTransfer(req.user.id, body.deviceId, 'upload', body.path, body.sizeBytes);

        return {
            transferId: transfer.id,
            uploadUrl: `/cockpit/cocktail/transfers/${transfer.id}/upload`
        };
    }

    @Put('transfers/:transferId/upload')
    @UseGuards(SessionGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Browser uploads file content to server' })
    async uploadFromBrowser(@Request() req: any, @Param('transferId') transferId: string) {
        const transfer = await this.cocktailService.getTransferForUser(transferId, req.user.id);
        if (transfer.type !== 'upload') throw new BadRequestException('Not an upload transfer');

        const tempDir = join(process.cwd(), 'upload_temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempPath = join(tempDir, transferId);
        const writeStream = fs.createWriteStream(tempPath);

        await new Promise((resolve, reject) => {
            req.pipe(writeStream);
            writeStream.on('finish', () => resolve(true));
            writeStream.on('error', (err) => {
                console.error("Upload write error:", err);
                reject(new BadRequestException('Failed to write upload data'));
            });
        });

        // Update transfer status
        const finalSize = fs.statSync(tempPath).size;
        const db = (this.cocktailService as any).drizzle.db;
        await db.update(cocktailTransfers)
            .set({ sizeBytes: finalSize, status: 'done' })
            .where(eq(cocktailTransfers.id, transferId));

        // Enqueue task for agent to download the file from the server to its local path
        const serverUrl = process.env.API_PUBLIC_URL || 'https://cognode.a2.cockpit.run';
        await this.cocktailService.createTask(req.user.id, transfer.deviceId, 'fs.pull_from_server', {
            transferId: transfer.id,
            path: transfer.path,
            downloadUrl: `${serverUrl}/cockpit/cocktail/device/transfers/${transfer.id}/agent-download`
        });

        return { success: true };
    }

    @Post('transfers/download/init')
    @UseGuards(SessionGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Initialize download session (VPS -> Browser) via R2' })
    async initDownload(@Request() req: any, @Body() body: { deviceId: string, path: string }) {
        if (!body.deviceId || !body.path) throw new BadRequestException('Missing deviceId or path');

        const key = `transfers/${req.user.id}/${body.deviceId}/${Date.now()}-${path.basename(body.path)}`;
        const putUrl = await this.storageService.getPresignedPutUrl(key, 'application/octet-stream');
        const getUrl = await this.storageService.getPresignedGetUrl(key);

        const task = await this.cocktailService.createTask(req.user.id, body.deviceId, 'FILE_UPLOAD_TO_R2', {
            path: body.path,
            putUrl,
            key
        });

        return {
            taskId: task.id,
            downloadUrl: getUrl,
            transferId: task.id, // for compatibility
            status: 'pending'
        };
    }

    @Get('transfers/:transferId/download')
    @UseGuards(SessionGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Browser downloads file' })
    async downloadToBrowser(@Request() req: any, @Param('transferId') transferId: string) {
        const transfer = await this.cocktailService.getTransferForUser(transferId, req.user.id);

        const tempPath = join(process.cwd(), 'upload_temp', transferId);

        // Wait for it? 
        if (!fs.existsSync(tempPath)) {
            // Check status. If pending, maybe agent hasn't pushed yet.
            if (transfer.status === 'pending') throw new BadRequestException('File not yet received from agent');
            throw new NotFoundException('File lost');
        }

        const file = fs.createReadStream(tempPath);
        return new StreamableFile(file);
    }

    // --- Agent Endpoints (Device Auth) ---

    @Post('transfers/:transferId/agent-upload')
    @UseGuards(CocktailAuthGuard)
    @ApiHeader({ name: 'x-device-id' })
    @ApiOperation({ summary: 'Agent uploads file content to server (for user download)' })
    async agentUpload(@Request() req: any, @Param('transferId') transferId: string) {
        // Agent PUTs file here (binary stream in body).

        await this.cocktailService.getTransferForAgent(transferId, req.device.id);

        const tempDir = join(process.cwd(), 'upload_temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        const tempPath = join(tempDir, transferId);

        // Write stream to file
        const writeStream = fs.createWriteStream(tempPath);

        return new Promise((resolve, reject) => {
            req.pipe(writeStream);
            writeStream.on('finish', async () => {
                // Update transfer status
                const db = this.cocktailService['drizzle'].db; // access internal db or add method updateTransferStatus
                await db.update(cocktailTransfers)
                    .set({ status: 'done', sizeBytes: fs.statSync(tempPath).size })
                    .where(eq(cocktailTransfers.id, transferId));

                resolve({ success: true });
            });
            writeStream.on('error', (err) => {
                reject(new BadRequestException('Upload stream failed'));
            });
        });
    }

    @Get('transfers/:transferId/agent-download')
    @UseGuards(CocktailAuthGuard)
    @ApiHeader({ name: 'x-device-id' })
    @ApiOperation({ summary: 'Agent downloads file content from server (uploaded by user)' })
    async agentDownload(@Request() req: any, @Param('transferId') transferId: string) {
        await this.cocktailService.getTransferForAgent(transferId, req.device.id);

        const tempPath = join(process.cwd(), 'upload_temp', transferId);
        if (!fs.existsSync(tempPath)) throw new NotFoundException('File not found on server');

        const file = fs.createReadStream(tempPath);
        return new StreamableFile(file);
    }

}
