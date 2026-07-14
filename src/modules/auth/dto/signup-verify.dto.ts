
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignupVerifyDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'User ID received from start step' })
    @IsUUID()
    @IsNotEmpty()
    userId: string;

    @ApiProperty({ example: 'AX12', description: '4-character alphanumeric OTP' })
    @IsString()
    @IsNotEmpty()
    otp: string;
}
