import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
    VerifiedRegistrationResponse,
    VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
    RegistrationResponseJSON,
    AuthenticationResponseJSON,
    AuthenticatorTransportFuture,
    AuthenticatorDevice,
} from '@simplewebauthn/types';
import { Passkey } from '@/db/drizzle/schema';

@Injectable()
export class WebauthnService {
    private readonly rpName: string;
    private readonly rpId: string;
    private readonly rpOrigin: string;

    constructor(private readonly configService: ConfigService) {
        this.rpName = this.configService.get<string>('RP_NAME', 'Sandbox');
        this.rpId = this.configService.get<string>('RP_ID', 'localhost');
        this.rpOrigin = this.configService.get<string>('RP_ORIGIN', 'http://localhost:3000');
    }

    async generateRegistrationOptions(
        userId: string,
        userName: string,
        userDisplayName: string,
        existingPasskeys: Passkey[],
    ): Promise<PublicKeyCredentialCreationOptionsJSON> {
        // Convert existing passkeys to exclude credentials format
        const excludeCredentials = existingPasskeys.map((passkey) => ({
            id: passkey.credentialId,
            type: 'public-key' as const,
            transports: (passkey.transports as AuthenticatorTransportFuture[]) || undefined,
        }));

        const options = await generateRegistrationOptions({
            rpName: this.rpName,
            rpID: this.rpId,
            userID: new TextEncoder().encode(userId),
            userName,
            userDisplayName,
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
            },
            excludeCredentials,
        });

        return options;
    }

    async verifyRegistration(
        response: RegistrationResponseJSON,
        expectedChallenge: string,
    ): Promise<VerifiedRegistrationResponse> {
        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge,
            expectedOrigin: this.rpOrigin,
            expectedRPID: this.rpId,
        });

        return verification;
    }

    async generateAuthenticationOptions(
        passkeys: Passkey[],
    ): Promise<PublicKeyCredentialRequestOptionsJSON> {
        const allowCredentials = passkeys.map((passkey) => ({
            id: passkey.credentialId,
            type: 'public-key' as const,
            transports: (passkey.transports as AuthenticatorTransportFuture[]) || undefined,
        }));

        const options = await generateAuthenticationOptions({
            rpID: this.rpId,
            allowCredentials,
            userVerification: 'preferred',
        });

        return options;
    }

    async verifyAuthentication(
        response: AuthenticationResponseJSON,
        expectedChallenge: string,
        authenticator: AuthenticatorDevice,
    ): Promise<VerifiedAuthenticationResponse> {
        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
            expectedOrigin: this.rpOrigin,
            expectedRPID: this.rpId,
            authenticator,
        });

        return verification;
    }

    // Helper to convert base64url string to Uint8Array
    base64urlToUint8Array(base64url: string): Uint8Array {
        const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
        const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + padding;
        const binary = Buffer.from(base64, 'base64');
        return new Uint8Array(binary);
    }

    // Helper to convert Uint8Array to base64url string
    uint8ArrayToBase64url(buffer: Uint8Array): string {
        return Buffer.from(buffer)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
}
