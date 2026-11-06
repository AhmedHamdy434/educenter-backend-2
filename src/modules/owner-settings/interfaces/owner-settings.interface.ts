import { Prisma } from '@prisma/client';
import { centerSettingsSelect } from '../constants/owner-settings.select';

export type CenterSettingsResponse = Prisma.CenterSettingsGetPayload<{
  select: typeof centerSettingsSelect;
}>;
