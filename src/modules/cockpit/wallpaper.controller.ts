import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CockpitService } from './cockpit.service';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { CurrentUser } from '../../platform/http/decorators/current-user.decorator';

@ApiTags('Cockpit Wallpaper')
@Controller('cockpit/wallpaper')
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class WallpaperController {
    constructor(private readonly cockpitService: CockpitService) { }

    @Get()
    @ApiOperation({ summary: 'Get current wallpaper' })
    @ApiResponse({ status: 200, description: 'Current wallpaper ID' })
    async getWallpaper(@CurrentUser('id') userId: string) {
        return this.cockpitService.getWallpaper(userId);
    }

    @Post()
    @ApiOperation({ summary: 'Update wallpaper' })
    @ApiResponse({ status: 200, description: 'Wallpaper updated' })
    async updateWallpaper(
        @CurrentUser('id') userId: string,
        @Body('wallpaperId') wallpaperId: number,
    ) {
        return this.cockpitService.updateWallpaper(userId, wallpaperId);
    }
}
