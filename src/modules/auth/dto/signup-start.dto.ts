import { IsString, IsEmail, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SignupStartDto {
    @ApiProperty({ example: 'John' })
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    firstName: string;

    @ApiProperty({ example: 'Doe' })
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    lastName: string;

    @ApiProperty({ example: 'john@example.com' })
    @IsEmail()
    @MaxLength(255)
    email: string;

    @ApiProperty({ example: 'johndoe' })
    @IsString()
    @MinLength(3)
    @MaxLength(100)
    username: string;

    @ApiPropertyOptional({ example: false })
    @IsOptional()
    @IsBoolean()
    marketingOptIn?: boolean;
}
