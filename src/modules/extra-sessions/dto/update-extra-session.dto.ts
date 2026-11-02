import { PartialType } from '@nestjs/swagger';
import { CreateExtraSessionDto } from './create-extra-session.dto';

export class UpdateExtraSessionDto extends PartialType(CreateExtraSessionDto) {}
