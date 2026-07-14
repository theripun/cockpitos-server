import { Injectable, ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, or } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { DrizzleService } from '../../db/drizzle/drizzle.service';
import { users, sessions, User } from '@/db/drizzle/schema';
import { ErrorCodes } from '../../common/constants/error-codes';
import { normalizeEmail, normalizeUsername } from '../../common/utils/strings.util';
import { addSeconds } from '../../common/utils/time.util';
import { SignupStartDto } from './dto/signup-start.dto';
import { MailService } from '../mail/mail.service';
import { ActivityService } from '../activity/activity.service';
import axios from 'axios';

@Injectable()
export class AuthService {
    private readonly sessionTtlSeconds: number;

    constructor(
        private readonly drizzle: DrizzleService,
        private readonly configService: ConfigService,
        private readonly mailService: MailService,
        private readonly activityService: ActivityService,
    ) {
        this.sessionTtlSeconds = parseInt(
            this.configService.get<string>('SESSION_TTL_SECONDS', '604800'),
            10,
        );
    }

    private generateOtp(): string {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Mixed alpha-numeric, avoiding confusing chars
        let otp = '';
        for (let i = 0; i < 4; i++) {
            otp += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return otp;
    }

    async signupStart(dto: SignupStartDto): Promise<{ userId: string }> {
        const db = this.drizzle.db;
        const email = normalizeEmail(dto.email);
        const username = normalizeUsername(dto.username);

        // Check if email or username already exists
        const existing = await db
            .select()
            .from(users)
            .where(or(eq(users.email, email), eq(users.username, username)))
            .limit(1);

        let userId: string;
        const otp = this.generateOtp();
        const otpExpiresAt = addSeconds(new Date(), 600); // 10 minutes

        if (existing.length > 0) {
            const existingUser = existing[0];

            // If user is already verified (has password), conflict
            if (existingUser.passwordHash) {
                if (existingUser.email === email) {
                    throw new ConflictException({
                        code: ErrorCodes.EMAIL_EXISTS,
                        message: 'Email already registered',
                    });
                }
                throw new ConflictException({
                    code: ErrorCodes.USERNAME_EXISTS,
                    message: 'Username already taken',
                });
            }

            // pending user, update OTP
            userId = existingUser.id;
            await db.update(users)
                .set({ otp, otpExpiresAt, firstName: dto.firstName, lastName: dto.lastName })
                .where(eq(users.id, userId));
        } else {
            // New user
            const [newUser] = await db
                .insert(users)
                .values({
                    email,
                    username,
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    marketingOptIn: dto.marketingOptIn ?? false,
                    role: 'user',
                    otp,
                    otpExpiresAt,
                    isEmailVerified: false,
                })
                .returning({ id: users.id });
            userId = newUser.id;
        }

        // Send Email
        try {
            await this.mailService.sendOtpEmail(email, otp);
        } catch (e) {
            console.error('Failed to send OTP email:', e);
            // We don't fail the request, but user won't get OTP.
            // Maybe we should fail? For now, log it.
        }

        return { userId };
    }

    async signupVerify(userId: string, otp: string): Promise<void> {
        const db = this.drizzle.db;
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

        if (!user) {
            throw new NotFoundException({ code: ErrorCodes.USER_NOT_FOUND, message: 'User not found' });
        }

        if (user.isEmailVerified && user.passwordHash) {
            return; // Already verified
        }

        if (!user.otp || !user.otpExpiresAt) {
            throw new UnauthorizedException({ message: 'No OTP request found' });
        }

        if (new Date() > user.otpExpiresAt) {
            throw new UnauthorizedException({ message: 'OTP expired' });
        }

        if (user.otp !== otp.toUpperCase()) {
            throw new UnauthorizedException({ message: 'Invalid OTP' });
        }

        await db.update(users)
            .set({ isEmailVerified: true, otp: null, otpExpiresAt: null })
            .where(eq(users.id, userId));
    }

    async signupPassword(userId: string, password: string): Promise<void> {
        const db = this.drizzle.db;

        // Check if verified
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) {
            throw new NotFoundException({ code: ErrorCodes.USER_NOT_FOUND, message: 'User not found' });
        }

        if (!user.isEmailVerified) {
            throw new UnauthorizedException({ message: 'Email not verified' });
        }

        // Hash password
        const passwordHash = await argon2.hash(password);

        // Update user
        await db
            .update(users)
            .set({ passwordHash, updatedAt: new Date() })
            .where(eq(users.id, userId));

        await this.activityService.logAction(userId, 'USER_CREATED', 'user', userId);
    }

    async loginPassword(
        usernameOrEmail: string,
        password: string,
    ): Promise<User> {
        const db = this.drizzle.db;
        const normalized = normalizeEmail(usernameOrEmail);

        // Find user by email or username
        const [user] = await db
            .select()
            .from(users)
            .where(or(eq(users.email, normalized), eq(users.username, normalized)))
            .limit(1);

        if (!user || !user.passwordHash) {
            throw new UnauthorizedException({
                code: ErrorCodes.INVALID_CREDENTIALS,
                message: 'Invalid credentials',
            });
        }

        // Verify password
        const valid = await argon2.verify(user.passwordHash, password);
        if (!valid) {
            throw new UnauthorizedException({
                code: ErrorCodes.INVALID_CREDENTIALS,
                message: 'Invalid credentials',
            });
        }

        return user;
    }

    async createSession(
        userId: string,
        ip?: string,
        userAgent?: string,
    ): Promise<string> {
        const db = this.drizzle.db;
        const sessionId = uuidv4();
        const now = new Date();
        const expiresAt = addSeconds(now, this.sessionTtlSeconds);

        const [session] = await db.insert(sessions).values({
            id: sessionId,
            userId,
            createdAt: now,
            expiresAt,
            ip,
            userAgent,
        }).returning({ id: sessions.id });

        return session.id;
    }

    async revokeSession(sessionId: string): Promise<void> {
        const db = this.drizzle.db;
        await db
            .update(sessions)
            .set({ revokedAt: new Date() })
            .where(eq(sessions.id, sessionId));
    }

    async getUserById(userId: string): Promise<User | null> {
        const db = this.drizzle.db;
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
        return user || null;
    }

    async getUserByUsernameOrEmail(usernameOrEmail: string): Promise<User | null> {
        const db = this.drizzle.db;
        const normalized = normalizeEmail(usernameOrEmail);
        const [user] = await db
            .select()
            .from(users)
            .where(or(eq(users.email, normalized), eq(users.username, normalized)))
            .limit(1);
        return user || null;
    }

    async forgotPassword(email: string): Promise<void> {
        const db = this.drizzle.db;
        const normalized = normalizeEmail(email);

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, normalized))
            .limit(1);

        if (!user) {
            // Silently return to prevent enumeration
            return;
        }

        const token = uuidv4();
        const expiresAt = addSeconds(new Date(), 3600); // 1 hour

        await db
            .update(users)
            .set({
                resetPasswordToken: token,
                resetPasswordExpiresAt: expiresAt,
            })
            .where(eq(users.id, user.id));

        await this.mailService.sendPasswordResetEmail(user.email, token);
    }

    async resetPassword(token: string, newPassword: string): Promise<void> {
        const db = this.drizzle.db;

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.resetPasswordToken, token))
            .limit(1);

        if (!user) {
            throw new UnauthorizedException({ message: 'Invalid or expired token' });
        }

        if (!user.resetPasswordExpiresAt || new Date() > user.resetPasswordExpiresAt) {
            throw new UnauthorizedException({ message: 'Token expired' });
        }

        const passwordHash = await argon2.hash(newPassword);

        await db
            .update(users)
            .set({
                passwordHash,
                updatedAt: new Date(),
                resetPasswordToken: null,
                resetPasswordExpiresAt: null,
            })
            .where(eq(users.id, user.id));
    }

    async githubCallback(code: string, ip?: string, userAgent?: string): Promise<string> {
        const db = this.drizzle.db;

        // 1. Get access token from GitHub
        const clientId = this.configService.get<string>('GITHUB_CLIENT_ID');
        const clientSecret = this.configService.get<string>('GITHUB_CLIENT_SECRET');

        const tokenRes = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: clientId,
            client_secret: clientSecret,
            code,
        }, {
            headers: { Accept: 'application/json' }
        });

        const accessToken = tokenRes.data.access_token;
        if (!accessToken) {
            throw new UnauthorizedException('Failed to get GitHub access token');
        }

        // 2. Get user info from GitHub
        const userRes = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const githubUser = userRes.data;

        // 3. Get user email if not public
        let email = githubUser.email;
        if (!email) {
            const emailRes = await axios.get('https://api.github.com/user/emails', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const primaryEmail = emailRes.data.find((e: any) => e.primary && e.verified);
            email = primaryEmail ? primaryEmail.email : emailRes.data[0]?.email;
        }

        if (!email) {
            throw new UnauthorizedException('GitHub account must have an email address');
        }

        const normalizedEmail = normalizeEmail(email);
        const githubUsername = normalizeUsername(githubUser.login);

        // 4. Find or Create User
        let user = await this.getUserByUsernameOrEmail(normalizedEmail);

        if (!user) {
            user = await this.getUserByUsernameOrEmail(githubUsername);
        }

        let userId: string;

        if (user) {
            userId = user.id;
            // Mark email as verified if it wasn't
            if (!user.isEmailVerified) {
                await db.update(users).set({ isEmailVerified: true }).where(eq(users.id, userId));
            }
        } else {
            // Split name into first and last
            const nameParts = (githubUser.name || githubUser.login).split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

            // Create new user
            let newUsername = githubUsername;
            // check if username exists
            const existingUsername = await this.getUserByUsernameOrEmail(newUsername);
            if (existingUsername) {
                newUsername = `${newUsername}${Math.floor(Math.random() * 10000)}`;
            }

            const [newUser] = await db.insert(users).values({
                email: normalizedEmail,
                username: newUsername,
                firstName,
                lastName,
                role: 'user',
                isEmailVerified: true, // Trusted from GitHub
            }).returning({ id: users.id });

            userId = newUser.id;
        }

        // 5. Create session
        return this.createSession(userId, ip, userAgent);
    }
}
