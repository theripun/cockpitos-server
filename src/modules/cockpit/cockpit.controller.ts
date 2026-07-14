import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    Res,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { CockpitService } from './cockpit.service';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { CurrentUser } from '../../platform/http/decorators/current-user.decorator';
import { CreateVpsDto } from './dto/create-vps.dto';
import { UpdateVpsDto } from './dto/update-vps.dto';
import { AcceptHostKeyDto } from './dto/accept-host-key.dto';

@ApiTags('Cockpit')
@Controller('cockpit/vps')
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class CockpitController {
    constructor(private readonly cockpitService: CockpitService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new VPS connection' })
    @ApiResponse({ status: 201, description: 'VPS created' })
    async create(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateVpsDto,
    ) {
        return this.cockpitService.createVps(userId, dto);
    }

    @Get()
    @ApiOperation({ summary: 'List all VPS connections for user' })
    @ApiResponse({ status: 200, description: 'List of VPS' })
    async findAll(@CurrentUser('id') userId: string) {
        return this.cockpitService.findAllVps(userId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get VPS details' })
    @ApiResponse({ status: 200, description: 'VPS details' })
    async findOne(
        @CurrentUser('id') userId: string,
        @Param('id') vpsId: string,
    ) {
        return this.cockpitService.findOneVps(userId, vpsId);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update VPS details' })
    @ApiResponse({ status: 200, description: 'Updated VPS' })
    async update(
        @CurrentUser('id') userId: string,
        @Param('id') vpsId: string,
        @Body() dto: UpdateVpsDto,
    ) {
        return this.cockpitService.updateVps(userId, vpsId, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Delete a VPS' })
    @ApiResponse({ status: 200, description: 'VPS deleted' })
    async delete(
        @CurrentUser('id') userId: string,
        @Param('id') vpsId: string,
    ) {
        return this.cockpitService.deleteVps(userId, vpsId);
    }

    @Post(':id/verify')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Verify SSH connectivity' })
    @ApiResponse({ status: 200, description: 'Verification result' })
    async verify(
        @CurrentUser('id') userId: string,
        @Param('id') vpsId: string,
    ) {
        return this.cockpitService.verifyVps(userId, vpsId);
    }

    @Post(':id/hostkey/accept')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Accept new host key fingerprint' })
    @ApiResponse({ status: 200, description: 'Host key accepted' })
    async acceptHostKey(
        @CurrentUser('id') userId: string,
        @Param('id') vpsId: string,
        @Body() body: AcceptHostKeyDto,
    ) {
        return this.cockpitService.acceptHostKey(userId, vpsId, body.fingerprint);
    }
}
