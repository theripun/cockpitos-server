import { IsString, IsBoolean, IsOptional, MinLength, MaxLength, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMeDto {
    @ApiPropertyOptional({ example: 'John' })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    firstName?: string;

    @ApiPropertyOptional({ example: 'Doe' })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    lastName?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @IsBoolean()
    marketingOptIn?: boolean;

    @ApiPropertyOptional({ example: 11 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(35)
    wallpaperId?: number;
}
