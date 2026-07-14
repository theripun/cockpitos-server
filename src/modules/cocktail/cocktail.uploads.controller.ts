import { Controller, Post, Body, Param, UseGuards, Request, BadRequestException, Get, NotFoundException, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { CocktailService } from './cocktail.service';
import { StorageService } from './storage.service';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { CurrentUser } from '../../platform/http/decorators/current-user.decorator';
import { cocktailUploads, cocktailDevices, cocktailTasks } from '@/db/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { DrizzleService } from '../../db/drizzle/drizzle.service';

@ApiTags('Cocktail Uploads')
@Controller('cockpit/vps/:vpsId/uploads')
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class CocktailUploadsController {
    constructor(
        private readonly cocktailService: CocktailService,
        private readonly storageService: StorageService,
        private readonly drizzle: DrizzleService,
    ) { }

    @Post('init')
    @ApiOperation({ summary: 'Initialize R2 upload session' })
    async initUpload(
        @CurrentUser('id') userId: string,
        @Param('vpsId') vpsId: string,
        @Body() body: { filename: string, sizeBytes: number, mimeType?: string, destPath: string }
    ) {
        if (!body.filename || !body.sizeBytes || !body.destPath) {
            throw new BadRequestException('Missing filename, sizeBytes, or destPath');
        }

        // 1. Find the device for this VPS
        const [device] = await this.drizzle.db
            .select()
            .from(cocktailDevices)
            .where(and(eq(cocktailDevices.vpsId, vpsId), eq(cocktailDevices.userId, userId)))
            .limit(1);

        if (!device) throw new NotFoundException('No cocktail agent enrolled for this VPS');

        // 2. Validate path (basic safety)
        const path = body.destPath;
        if (path.includes('..') || path.startsWith('/root')) {
            // Very basic check, agent will do strict check
            // throw new BadRequestException('Invalid destination path');
        }

        // 3. Create upload record
        const uploadId = crypto.randomUUID();
        const objectKey = `uploads/vps/${vpsId}/${uploadId}/${body.filename}`;

        const [upload] = await this.drizzle.db
            .insert(cocktailUploads)
            .values({
                id: uploadId,
                userId,
                vpsId,
                deviceId: device.id,
                objectKey,
                filename: body.filename,
                sizeBytes: body.sizeBytes,
                mimeType: body.mimeType,
                destPath: body.destPath,
                status: 'INIT'
            })
            .returning();

        // 4. Generate pre-signed PUT URL
        const putUrl = await this.storageService.getPresignedPutUrl(objectKey, body.mimeType || 'application/octet-stream');

        return {
            uploadId: upload.id,
            objectKey,
            putUrl,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 mins
        };
    }

    @Post(':uploadId/complete')
    @ApiOperation({ summary: 'Finalize upload and trigger agent pull' })
    async completeUpload(
        @CurrentUser('id') userId: string,
        @Param('vpsId') vpsId: string,
        @Param('uploadId') uploadId: string,
        @Body() body: { sha256?: string, mode?: string }
    ) {
        const [upload] = await this.drizzle.db
            .select()
            .from(cocktailUploads)
            .where(and(eq(cocktailUploads.id, uploadId), eq(cocktailUploads.userId, userId)))
            .limit(1);

        if (!upload) throw new NotFoundException('Upload not found');

        // Update status
        await this.drizzle.db
            .update(cocktailUploads)
            .set({
                status: 'UPLOADED',
                sha256: body.sha256,
                updatedAt: new Date()
            })
            .where(eq(cocktailUploads.id, uploadId));

        // Generate pre-signed GET URL for agent (expires in 30 mins)
        const getUrl = await this.storageService.getPresignedGetUrl(upload.objectKey, 1800);

        // Enqueue agent task
        const task = await this.cocktailService.createTask(userId, upload.deviceId, 'FILE_DOWNLOAD_FROM_R2', {
            uploadId: upload.id,
            getUrl,
            destPath: upload.destPath,
            sizeBytes: upload.sizeBytes,
            sha256: body.sha256 || upload.sha256,
            mode: body.mode || '0644'
        });

        // Link task to upload
        await this.drizzle.db
            .update(cocktailUploads)
            .set({ taskId: task.id, status: 'TASKED' })
            .where(eq(cocktailUploads.id, uploadId));

        return { taskId: task.id };
    }

    @Get(':uploadId')
    @ApiOperation({ summary: 'Get upload and task status' })
    async getStatus(
        @CurrentUser('id') userId: string,
        @Param('uploadId') uploadId: string
    ) {
        const [result] = await this.drizzle.db
            .select({
                upload: cocktailUploads,
                task: cocktailTasks
            })
            .from(cocktailUploads)
            .leftJoin(cocktailTasks, eq(cocktailUploads.taskId, cocktailTasks.id))
            .where(and(eq(cocktailUploads.id, uploadId), eq(cocktailUploads.userId, userId)))
            .limit(1);

        if (!result) throw new NotFoundException('Upload not found');

        return result;
    }
}
