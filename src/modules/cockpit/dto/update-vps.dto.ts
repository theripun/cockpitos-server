import { PartialType } from '@nestjs/swagger';
import { CreateVpsDto } from './create-vps.dto';

export class UpdateVpsDto extends PartialType(CreateVpsDto) { }
