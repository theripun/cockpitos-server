import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, gt, lt, or } from 'drizzle-orm';
import type {
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
    RegistrationResponseJSON,
    AuthenticationResponseJSON,
    AuthenticatorTransportFuture,
} from '@simplewebauthn/types';
import { DrizzleService } from '../../../db/drizzle/drizzle.service';
import {
    users,
    passkeys,
    webauthnChallenges,
    Passkey,
} from '@/db/drizzle/schema';
import { WebauthnService } from './webauthn.service';
import { ErrorCodes } from '../../../common/constants/error-codes';
import { addSeconds } from '../../../common/utils/time.util';
import { normalizeEmail } from '../../../common/utils/strings.util';

@Injectable()
export class PasskeysService {
    private readonly challengeTtlSeconds: number;

    constructor(
        private readonly drizzle: DrizzleService,
        private readonly webauthnService: WebauthnService,
        private readonly configService: ConfigService,
    ) {
        this.challengeTtlSeconds = parseInt(
            this.configService.get<string>('WEBAUTHN_CHALLENGE_TTL_SECONDS', '300'),
            10,
        );
    }

    async startRegistration(userId: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
        const db = this.drizzle.db;

        // Clean up expired challenges
        await this.cleanupExpiredChallenges();

        // Get user
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        if (!user) {
            throw new NotFoundException({
                code: ErrorCodes.USER_NOT_FOUND,
                message: 'User not found',
            });
        }

        // Get existing passkeys
        const existingPasskeys = await db
            .select()
            .from(passkeys)
            .where(eq(passkeys.userId, userId));

        // Generate registration options
        const options = await this.webauthnService.generateRegistrationOptions(
            user.id,
            user.username,
            `${user.firstName} ${user.lastName}`,
            existingPasskeys,
        );

        // Save challenge
        await db.insert(webauthnChallenges).values({
            userId,
            challenge: options.challenge,
            type: 'registration',
            expiresAt: addSeconds(new Date(), this.challengeTtlSeconds),
        });

        return options;
    }

    async finishRegistration(userId: string, data: Record<string, unknown>): Promise<void> {
        const db = this.drizzle.db;
        const response = data as unknown as RegistrationResponseJSON;

        // Get the latest unexpired challenge
        const now = new Date();
        const [challenge] = await db
            .select()
            .from(webauthnChallenges)
            .where(
                and(
                    eq(webauthnChallenges.userId, userId),
                    eq(webauthnChallenges.type, 'registration'),
                    gt(webauthnChallenges.expiresAt, now),
                ),
            )
            .orderBy(webauthnChallenges.createdAt)
            .limit(1);

        if (!challenge) {
            throw new BadRequestException({
                code: ErrorCodes.CHALLENGE_NOT_FOUND,
                message: 'No valid challenge found. Please start registration again.',
            });
        }

        // Verify registration
        const verification = await this.webauthnService.verifyRegistration(
            response,
            challenge.challenge,
        );

        if (!verification.verified || !verification.registrationInfo) {
            throw new BadRequestException({
                code: ErrorCodes.PASSKEY_REGISTRATION_FAILED,
                message: 'Passkey registration failed',
            });
        }

        const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

        // Store passkey
        await db.insert(passkeys).values({
            userId,
            credentialId: credentialID,
            publicKey: this.webauthnService.uint8ArrayToBase64url(credentialPublicKey),
            counter,
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            transports: (response.response.transports as AuthenticatorTransportFuture[]) || null,
        });

        // Delete the challenge
        await db
            .delete(webauthnChallenges)
            .where(eq(webauthnChallenges.id, challenge.id));
    }

    async startAuthentication(usernameOrEmail: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
        const db = this.drizzle.db;

        // Clean up expired challenges
        await this.cleanupExpiredChallenges();

        const normalized = normalizeEmail(usernameOrEmail);

        // Get user
        const [user] = await db
            .select()
            .from(users)
            .where(or(eq(users.email, normalized), eq(users.username, normalized)))
            .limit(1);

        if (!user) {
            throw new NotFoundException({
                code: ErrorCodes.USER_NOT_FOUND,
                message: 'User not found',
            });
        }

        // Get user passkeys
        const userPasskeys = await db
            .select()
            .from(passkeys)
            .where(eq(passkeys.userId, user.id));

        if (userPasskeys.length === 0) {
            throw new BadRequestException({
                code: ErrorCodes.PASSKEY_NOT_FOUND,
                message: 'No passkeys registered for this user',
            });
        }

        // Generate authentication options
        const options = await this.webauthnService.generateAuthenticationOptions(userPasskeys);

        // Save challenge
        await db.insert(webauthnChallenges).values({
            userId: user.id,
            challenge: options.challenge,
            type: 'authentication',
            expiresAt: addSeconds(new Date(), this.challengeTtlSeconds),
        });

        return options;
    }

    async finishAuthentication(usernameOrEmail: string, data: Record<string, unknown>): Promise<string> {
        const db = this.drizzle.db;
        const response = data as unknown as AuthenticationResponseJSON;
        const normalized = normalizeEmail(usernameOrEmail);

        // Get user
        const [user] = await db
            .select()
            .from(users)
            .where(or(eq(users.email, normalized), eq(users.username, normalized)))
            .limit(1);

        if (!user) {
            throw new NotFoundException({
                code: ErrorCodes.USER_NOT_FOUND,
                message: 'User not found',
            });
        }

        // Get user passkeys
        const userPasskeys = await db
            .select()
            .from(passkeys)
            .where(eq(passkeys.userId, user.id));

        // Find matching passkey by credential ID
        const passkey = userPasskeys.find(
            (p) => p.credentialId === response.id,
        );

        if (!passkey) {
            throw new BadRequestException({
                code: ErrorCodes.PASSKEY_NOT_FOUND,
                message: 'Passkey not found',
            });
        }

        // Get the latest unexpired challenge
        const now = new Date();
        const [challenge] = await db
            .select()
            .from(webauthnChallenges)
            .where(
                and(
                    eq(webauthnChallenges.userId, user.id),
                    eq(webauthnChallenges.type, 'authentication'),
                    gt(webauthnChallenges.expiresAt, now),
                ),
            )
            .orderBy(webauthnChallenges.createdAt)
            .limit(1);

        if (!challenge) {
            throw new BadRequestException({
                code: ErrorCodes.CHALLENGE_NOT_FOUND,
                message: 'No valid challenge found. Please start authentication again.',
            });
        }

        // Verify authentication using AuthenticatorDevice format
        // credentialID is Base64URLString, credentialPublicKey is Uint8Array
        const verification = await this.webauthnService.verifyAuthentication(
            response,
            challenge.challenge,
            {
                credentialID: passkey.credentialId,
                credentialPublicKey: this.webauthnService.base64urlToUint8Array(passkey.publicKey),
                counter: passkey.counter,
                transports: (passkey.transports as AuthenticatorTransportFuture[]) || undefined,
            },
        );

        if (!verification.verified) {
            throw new BadRequestException({
                code: ErrorCodes.PASSKEY_AUTHENTICATION_FAILED,
                message: 'Passkey authentication failed',
            });
        }

        // Update passkey counter
        await db
            .update(passkeys)
            .set({ counter: verification.authenticationInfo.newCounter })
            .where(eq(passkeys.id, passkey.id));

        // Delete the challenge
        await db
            .delete(webauthnChallenges)
            .where(eq(webauthnChallenges.id, challenge.id));

        return user.id;
    }

    // === Account management endpoints ===

    async getUserPasskeys(userId: string): Promise<Passkey[]> {
        const db = this.drizzle.db;
        return db
            .select()
            .from(passkeys)
            .where(eq(passkeys.userId, userId));
    }

    async deletePasskey(userId: string, passkeyId: string): Promise<void> {
        const db = this.drizzle.db;

        const result = await db
            .delete(passkeys)
            .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)))
            .returning({ id: passkeys.id });

        if (result.length === 0) {
            throw new NotFoundException({
                code: ErrorCodes.PASSKEY_NOT_FOUND,
                message: 'Passkey not found',
            });
        }
    }

    private async cleanupExpiredChallenges(): Promise<void> {
        const db = this.drizzle.db;
        const now = new Date();

        await db
            .delete(webauthnChallenges)
            .where(lt(webauthnChallenges.expiresAt, now));
    }
}
