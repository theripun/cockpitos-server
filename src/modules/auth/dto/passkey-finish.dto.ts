import { IsString, IsObject, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PasskeyFinishDto {
    @ApiProperty({
        example: '550e8400-e29b-41d4-a716-446655440000',
        description: 'User ID (for registration) or username/email (for login)'
    })
    @IsString()
    @MinLength(1)
    userId: string;

    @ApiProperty({
        description: 'WebAuthn credential response from browser',
        example: { id: 'credential-id', rawId: '...', response: { clientDataJSON: '...', attestationObject: '...' } }
    })
    @IsObject()
    data: Record<string, unknown>;
}
