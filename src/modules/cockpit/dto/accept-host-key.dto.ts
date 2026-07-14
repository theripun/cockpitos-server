import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptHostKeyDto {
    @ApiProperty({ example: 'SHA256:...' })
    @IsString()
    @IsNotEmpty()
    fingerprint: string;
}
