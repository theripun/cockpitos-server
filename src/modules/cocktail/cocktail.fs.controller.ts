import { Controller, Post, Get, Query, Body, UseGuards, Request, Param, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CocktailService } from './cocktail.service';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('Cocktail File System')
@Controller('cocktail-fs/:deviceId')
@UseGuards(SessionGuard)
@ApiBearerAuth()
@SkipThrottle()
export class CocktailFsController {
    constructor(private readonly cocktailService: CocktailService) { }

    @Post('list')
    @ApiOperation({ summary: 'List directory contents' })
    async list(@Request() req: any, @Param('deviceId') deviceId: string, @Body() body: { path: string, showHidden?: boolean }) {
        if (!body.path) throw new BadRequestException('Path required');
        const items = await this.cocktailService.getFsListCached(req.user.id, deviceId, body.path, body.showHidden);
        return { items };
    }

    @Get('list')
    @ApiOperation({ summary: 'List directory contents (GET for debug)' })
    async listGet(@Request() req: any, @Param('deviceId') deviceId: string, @Query('path') path: string) {
        return this.cocktailService.executeTaskSync(req.user.id, deviceId, 'fs.list', {
            path: path || '/',
            showHidden: false
        });
    }

    @Post('stat')
    @ApiOperation({ summary: 'Get file stats' })
    async stat(@Request() req: any, @Param('deviceId') deviceId: string, @Body() body: { path: string }) {
        if (!body.path) throw new BadRequestException('Path required');
        return this.cocktailService.executeTaskSync(req.user.id, deviceId, 'fs.stat', {
            path: body.path
        });
    }

    @Post('read-text')
    @ApiOperation({ summary: 'Read text file' })
    async readText(@Request() req: any, @Param('deviceId') deviceId: string, @Body() body: { path: string, maxBytes?: number }) {
        if (!body.path) throw new BadRequestException('Path required');
        return this.cocktailService.executeTaskSync(req.user.id, deviceId, 'fs.read_text', {
            path: body.path,
            maxBytes: body.maxBytes || 256 * 1024
        });
    }

    @Post('write-text')
    @ApiOperation({ summary: 'Write text file' })
    async writeText(@Request() req: any, @Param('deviceId') deviceId: string, @Body() body: { path: string, content: string, mode?: string }) {
        if (!body.path || body.content === undefined) throw new BadRequestException('Path and content required');
        const res = await this.cocktailService.executeTaskSync(req.user.id, deviceId, 'fs.write_text', {
            path: body.path,
            content: body.content,
            mode: body.mode
        });
        await this.cocktailService.invalidateFsCache(deviceId, body.path);
        return res;
    }

    @Post('mkdir')
    @ApiOperation({ summary: 'Create directory' })
    async mkdir(@Request() req: any, @Param('deviceId') deviceId: string, @Body() body: { path: string, recursive?: boolean }) {
        if (!body.path) throw new BadRequestException('Path required');
        const res = await this.cocktailService.executeTaskSync(req.user.id, deviceId, 'fs.mkdir', {
            path: body.path,
            recursive: body.recursive ?? true
        });
        await this.cocktailService.invalidateFsCache(deviceId, body.path);
        return res;
    }

    @Post('delete')
    @ApiOperation({ summary: 'Delete file or directory' })
    async delete(@Request() req: any, @Param('deviceId') deviceId: string, @Body() body: { path: string, recursive?: boolean }) {
        if (!body.path) throw new BadRequestException('Path required');
        const res = await this.cocktailService.executeTaskSync(req.user.id, deviceId, 'fs.delete', {
            path: body.path,
            recursive: body.recursive
        });
        await this.cocktailService.invalidateFsCache(deviceId, body.path);
        return res;
    }

    @Post('move')
    @ApiOperation({ summary: 'Move/Rename file' })
    async move(@Request() req: any, @Param('deviceId') deviceId: string, @Body() body: { from: string, to: string }) {
        if (!body.from || !body.to) throw new BadRequestException('Source and destination required');
        const res = await this.cocktailService.executeTaskSync(req.user.id, deviceId, 'fs.move', {
            from: body.from,
            to: body.to
        });
        await this.cocktailService.invalidateFsCache(deviceId, body.from);
        await this.cocktailService.invalidateFsCache(deviceId, body.to);
        return res;
    }

    @Post('search')
    @ApiOperation({ summary: 'Search files' })
    async search(@Request() req: any, @Param('deviceId') deviceId: string, @Body() body: { root: string, query: string, maxResults?: number }) {
        if (!body.query) throw new BadRequestException('Query required');
        return this.cocktailService.executeTaskSync(req.user.id, deviceId, 'fs.search', {
            root: body.root || '/',
            query: body.query,
            maxResults: body.maxResults || 200
        });
    }
}
