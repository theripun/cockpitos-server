import { IsString, IsInt, IsIn, IsNotEmpty, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVpsDto {
    @ApiProperty({ example: 'My Production VPS' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: '192.168.1.100' })
    @IsString()
    @IsNotEmpty()
    host: string;

    @ApiProperty({ example: 22, default: 22 })
    @IsInt()
    @Min(1)
    @Max(65535)
    port: number;

    @ApiProperty({ example: 'root' })
    @IsString()
    @IsNotEmpty()
    username: string;

    @ApiPropertyOptional({ example: 'password' })
    @IsOptional()
    @IsIn(['password', 'privateKey'])
    authType?: 'password' | 'privateKey';

    @ApiPropertyOptional({ example: 'password123' })
    @IsOptional()
    @IsString()
    password?: string;

    @ApiPropertyOptional({ example: '-----BEGIN OPENSSH PRIVATE KEY-----\\n...' })
    @IsOptional()
    @IsString()
    privateKey?: string;

    @ApiPropertyOptional({ example: 'optional-key-passphrase' })
    @IsOptional()
    @IsString()
    passphrase?: string;
}
