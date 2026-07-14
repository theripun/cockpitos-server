import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginPasswordDto {
    @ApiProperty({ example: 'johndoe', description: 'Username or email' })
    @IsString()
    @MinLength(1)
    @MaxLength(255)
    username: string;

    @ApiProperty({ example: 'SecurePassword123!' })
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    password: string;
}
