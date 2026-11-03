import { PartialType } from '@nestjs/mapped-types';
import { CreateExtraSessionDto } from './create-extra-session.dto';

export class UpdateExtraSessionDto extends PartialType(CreateExtraSessionDto) {}
