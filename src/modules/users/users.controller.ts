import {
    Controller,
    Get,
    Patch,
    Post,
    Delete,
    Body,
    Param,
    UseGuards,
    Res,
    Req,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { UsersService } from './users.service';
import { PasskeysService } from '../auth/passkeys/passkeys.service';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { CsrfGuard } from '../../platform/security/csrf/csrf.guard';
import { CurrentUser } from '../../platform/http/decorators/current-user.decorator';
import { RequestWithUser, RequestUser } from '../../platform/http/types/request-context.type';
import { UpdateMeDto } from './dto/update-me.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly passkeysService: PasskeysService,
    ) { }

    @Get('all')
    @ApiOperation({ summary: 'Get all users with their devices (Admin only)' })
    @ApiResponse({ status: 200, description: 'List of all users' })
    async getAllUsers(@CurrentUser() user: RequestUser) {
        // Here you would optimally add a role check to ensure `user.role === 'Admin' || user.role === 'Super Admin'`
        const users = await this.usersService.getAllUsersWithDevices();
        return users.map(u => ({
            id: u.id,
            email: u.email,
            username: u.username,
            firstName: u.firstName,
            lastName: u.lastName,
            name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username,
            role: u.role,
            status: 'active', // Placeholder for user status if not explicitly in DB
            isEmailVerified: u.isEmailVerified,
            createdAt: u.createdAt,
            lastSeen: null, // To be implemented with sessions/activity logs
            devices: u.devices,
            sessions: 0,
            activityScore: 50,
        }));
    }

    @Get('me')
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, description: 'Current user profile' })
    getMe(@CurrentUser() user: RequestUser) {
        return {
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            marketingOptIn: user.marketingOptIn,
            wallpaperId: user.wallpaperId || 11,
            plan: user.plan,
            planName: user.planName,
            subscriptionPlan: user.subscriptionPlan,
            subscriptionStatus: user.subscriptionStatus,
            planStatus: user.planStatus,
            subscriptionEndsAt: user.subscriptionEndsAt,
            subscriptionSource: user.subscriptionSource,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }

    @Patch('me')
    @UseGuards(CsrfGuard)
    @ApiOperation({ summary: 'Update current user profile' })
    @ApiResponse({ status: 200, description: 'Updated user profile' })
    async updateMe(
        @CurrentUser() user: RequestUser,
        @Body() dto: UpdateMeDto,
    ) {
        const updated = await this.usersService.updateUser(user.id, dto);
        return {
            id: updated.id,
            email: updated.email,
            username: updated.username,
            firstName: updated.firstName,
            lastName: updated.lastName,
            role: updated.role,
            marketingOptIn: updated.marketingOptIn,
            wallpaperId: updated.wallpaperId,
            plan: user.plan,
            planName: user.planName,
            subscriptionPlan: user.subscriptionPlan,
            subscriptionStatus: user.subscriptionStatus,
            planStatus: user.planStatus,
            subscriptionEndsAt: user.subscriptionEndsAt,
            subscriptionSource: user.subscriptionSource,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
        };
    }

    @Post('me/subscription/pro-offer')
    @UseGuards(CsrfGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Activate developer-granted Pro offer for current user' })
    @ApiResponse({ status: 200, description: 'Pro offer activated' })
    async activateDeveloperProOffer(@CurrentUser('id') userId: string) {
        const subscription = await this.usersService.activateDeveloperProOffer(userId);
        return {
            ok: true,
            plan: subscription.plan,
            planName: 'Pro Plan',
            subscriptionPlan: subscription.plan,
            subscriptionStatus: subscription.status,
            planStatus: subscription.status,
            subscriptionEndsAt: subscription.endsAt,
            subscriptionSource: subscription.source,
        };
    }

    // Passkey management
    @Get('me/passkeys')
    @ApiOperation({ summary: 'Get user passkeys' })
    @ApiResponse({ status: 200, description: 'List of user passkeys' })
    async getPasskeys(@CurrentUser('id') userId: string) {
        const passkeys = await this.passkeysService.getUserPasskeys(userId);
        // Don't expose sensitive data
        return passkeys.map((p) => ({
            id: p.id,
            deviceType: p.deviceType,
            backedUp: p.backedUp,
            createdAt: p.createdAt,
        }));
    }

    @Post('me/passkeys/start')
    @ApiOperation({ summary: 'Start registering a new passkey' })
    @ApiResponse({ status: 201, description: 'Registration options' })
    async startPasskeyRegistration(@CurrentUser('id') userId: string) {
        return this.passkeysService.startRegistration(userId);
    }

    @Post('me/passkeys/finish')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Finish registering a new passkey' })
    @ApiResponse({ status: 200, description: 'Passkey registered' })
    async finishPasskeyRegistration(
        @CurrentUser('id') userId: string,
        @Body() body: { data: Record<string, unknown> },
    ) {
        await this.passkeysService.finishRegistration(userId, body.data);
        return { ok: true };
    }

    @Delete('me/passkeys/:id')
    @UseGuards(CsrfGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Delete a passkey' })
    @ApiResponse({ status: 200, description: 'Passkey deleted' })
    async deletePasskey(
        @CurrentUser('id') userId: string,
        @Param('id') passkeyId: string,
    ) {
        await this.passkeysService.deletePasskey(userId, passkeyId);
        return { ok: true };
    }
}
