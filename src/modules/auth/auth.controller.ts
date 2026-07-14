import {
    Controller,
    Get,
    Post,
    Body,
    Res,
    Req,
    UseGuards,
    HttpCode,
    HttpStatus,
    SetMetadata,
    Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { ActivityService } from '../activity/activity.service';
import { PasskeysService } from './passkeys/passkeys.service';
import { CsrfService } from '../../platform/security/csrf/csrf.service';
import { CookieService } from '../../platform/security/cookies/cookie.service';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { CsrfGuard, CSRF_EXEMPT_KEY } from '../../platform/security/csrf/csrf.guard';
import { CurrentUser } from '../../platform/http/decorators/current-user.decorator';
import { RequestWithUser, RequestUser } from '../../platform/http/types/request-context.type';
import { SignupStartDto } from './dto/signup-start.dto';
import { SignupVerifyDto } from './dto/signup-verify.dto';
import { SignupPasswordDto } from './dto/signup-password.dto';
import { LoginPasswordDto } from './dto/login-password.dto';
import { PasskeyStartDto } from './dto/passkey-start.dto';
import { PasskeyFinishDto } from './dto/passkey-finish.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly passkeysService: PasskeysService,
        private readonly csrfService: CsrfService,
        private readonly cookieService: CookieService,
        private readonly configService: ConfigService,
        private readonly activityService: ActivityService,
    ) { }

    @Get('csrf')
    @ApiOperation({ summary: 'Get CSRF token' })
    @ApiResponse({ status: 200, description: 'CSRF token set in cookie' })
    getCsrf(@Res({ passthrough: true }) res: Response) {
        this.csrfService.rotateCsrfToken(res);
        return { ok: true };
    }

    @Post('signup/start')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @ApiOperation({ summary: 'Start signup process' })
    @ApiResponse({ status: 201, description: 'User created, returns userId' })
    async signupStart(@Body() dto: SignupStartDto) {
        return this.authService.signupStart(dto);
    }

    @Post('signup/verify')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @ApiOperation({ summary: 'Verify email with OTP' })
    @ApiResponse({ status: 200, description: 'Email verified' })
    async signupVerify(@Body() dto: SignupVerifyDto) {
        await this.authService.signupVerify(dto.userId, dto.otp);
        return { ok: true };
    }

    @Post('signup/password')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Complete signup with password' })
    @ApiResponse({ status: 200, description: 'Password set, session created' })
    async signupPassword(
        @Body() dto: SignupPasswordDto,
        @Req() req: RequestWithUser,
        @Res({ passthrough: true }) res: Response,
    ) {
        await this.authService.signupPassword(dto.userId, dto.password);

        // Create session
        const sessionId = await this.authService.createSession(
            dto.userId,
            req.ip,
            req.headers['user-agent'],
        );

        this.cookieService.setSessionCookie(res, sessionId);
        this.csrfService.rotateCsrfToken(res);

        await this.activityService.logAction(
            dto.userId,
            'AUTH_SIGNUP_PASSWORD',
            'user',
            dto.userId,
            null,
            req.ip,
            req.headers['user-agent'] as string,
        );

        return { ok: true };
    }

    @Post('login/password')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Login with password' })
    @ApiResponse({ status: 200, description: 'Session created' })
    async loginPassword(
        @Body() dto: LoginPasswordDto,
        @Req() req: RequestWithUser,
        @Res({ passthrough: true }) res: Response,
    ) {
        const user = await this.authService.loginPassword(dto.username, dto.password);

        const sessionId = await this.authService.createSession(
            user.id,
            req.ip,
            req.headers['user-agent'],
        );

        this.cookieService.setSessionCookie(res, sessionId);
        this.csrfService.rotateCsrfToken(res);

        await this.activityService.logAction(
            user.id,
            'AUTH_LOGIN_PASSWORD',
            'user',
            user.id,
            null,
            req.ip,
            req.headers['user-agent'] as string,
        );

        return { ok: true };
    }

    @Post('logout')
    @UseGuards(SessionGuard, CsrfGuard)
    @HttpCode(HttpStatus.OK)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Logout' })
    @ApiResponse({ status: 200, description: 'Session revoked' })
    async logout(
        @Req() req: RequestWithUser,
        @Res({ passthrough: true }) res: Response,
    ) {
        if (req.sessionId) {
            await this.authService.revokeSession(req.sessionId);
        }

        this.cookieService.clearSessionCookie(res);
        this.csrfService.rotateCsrfToken(res);

        return { ok: true };
    }

    @Post('forgot-password')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Request password reset email' })
    @ApiResponse({ status: 200, description: 'Reset email sent' })
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        await this.authService.forgotPassword(dto.email);
        return { ok: true, message: 'If email exists, reset link sent' };
    }

    @Post('reset-password')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Reset password using token' })
    @ApiResponse({ status: 200, description: 'Password reset successful' })
    async resetPassword(@Body() dto: ResetPasswordDto) {
        await this.authService.resetPassword(dto.token, dto.newPassword);
        return { ok: true, message: 'Password updated successfully' };
    }

    @Get('me')
    @UseGuards(SessionGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Get current user' })
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
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }

    // Passkey endpoints
    @Post('signup/passkey/start')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @ApiOperation({ summary: 'Start passkey registration during signup' })
    async signupPasskeyStart(@Body() dto: PasskeyStartDto) {
        return this.passkeysService.startRegistration(dto.userId);
    }

    @Post('signup/passkey/finish')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Finish passkey registration during signup' })
    async signupPasskeyFinish(
        @Body() dto: PasskeyFinishDto,
        @Req() req: RequestWithUser,
        @Res({ passthrough: true }) res: Response,
    ) {
        await this.passkeysService.finishRegistration(dto.userId, dto.data);

        // Create session
        const sessionId = await this.authService.createSession(
            dto.userId,
            req.ip,
            req.headers['user-agent'],
        );

        this.cookieService.setSessionCookie(res, sessionId);
        this.csrfService.rotateCsrfToken(res);

        return { ok: true };
    }

    @Post('login/passkey/start')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @ApiOperation({ summary: 'Start passkey authentication' })
    async loginPasskeyStart(@Body() dto: PasskeyStartDto) {
        // dto.userId can be username or email for login
        return this.passkeysService.startAuthentication(dto.userId);
    }

    @Post('login/passkey/finish')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Finish passkey authentication' })
    async loginPasskeyFinish(
        @Body() dto: PasskeyFinishDto,
        @Req() req: RequestWithUser,
        @Res({ passthrough: true }) res: Response,
    ) {
        const userId = await this.passkeysService.finishAuthentication(dto.userId, dto.data);

        const sessionId = await this.authService.createSession(
            userId,
            req.ip,
            req.headers['user-agent'],
        );

        this.cookieService.setSessionCookie(res, sessionId);
        this.csrfService.rotateCsrfToken(res);

        return { ok: true };
    }

    @Post('dev/login')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @ApiOperation({ summary: 'Dev Login (Backdoor)' })
    async devLogin(
        @Body('userId') userId: string,
        @Req() req: RequestWithUser,
        @Res({ passthrough: true }) res: Response,
    ) {
        // Default to the user who owns the VPS in the example
        const targetUserId = userId || '97cdf7ec-490d-4da9-b4d5-2bfbd88f22e0';

        const sessionId = await this.authService.createSession(
            targetUserId,
            req.ip,
            req.headers['user-agent'],
        );

        this.cookieService.setSessionCookie(res, sessionId);
        this.csrfService.rotateCsrfToken(res);

        return { ok: true, sessionId };
    }

    @Get('oauth/github')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @ApiOperation({ summary: 'Redirect to GitHub OAuth' })
    githubLogin(@Res() res: Response) {
        const clientId = this.configService.get('GITHUB_CLIENT_ID');
        const callbackUrl = encodeURIComponent(this.configService.get('GITHUB_CALLBACK_URL') as string);
        const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${callbackUrl}&scope=read:user user:email`;
        res.redirect(url);
    }

    @Get('oauth/github/callback')
    @SetMetadata(CSRF_EXEMPT_KEY, true)
    @ApiOperation({ summary: 'GitHub OAuth Callback' })
    async githubCallback(
        @Query('code') code: string,
        @Req() req: RequestWithUser,
        @Res() res: Response,
    ) {
        const frontendUrl = this.configService.get('FRONTEND_URL') || (this.configService.get('NODE_ENV') === 'production' ? 'https://www.cockpit.run' : 'http://localhost:3000');

        if (!code) {
            return res.redirect(`${frontendUrl}/?error=NoCodeProvided`);
        }

        try {
            const sessionId = await this.authService.githubCallback(
                code,
                req.ip,
                req.headers['user-agent']
            );

            this.cookieService.setSessionCookie(res, sessionId);
            this.csrfService.rotateCsrfToken(res);

            // Redirect back to frontend
            return res.redirect(`${frontendUrl}/?devices=true`);
        } catch (error) {
            console.error('GitHub OAuth error:', error);
            return res.redirect(`${frontendUrl}/?error=OAuthFailed`);
        }
    }
}

