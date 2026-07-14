import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNoteDto {
    @ApiPropertyOptional({ example: 'Updated Title.txt' })
    @IsString()
    @IsOptional()
    @MaxLength(255)
    title?: string;

    @ApiPropertyOptional({ example: 'Updated content' })
    @IsString()
    @IsOptional()
    content?: string;
}
