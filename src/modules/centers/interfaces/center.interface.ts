import { Prisma } from '@prisma/client';
import {
  centerDetailsSelect,
  centerListSelect,
} from '../constants/center.select';

export type CenterDetails = Prisma.CenterGetPayload<{
  select: typeof centerDetailsSelect;
}>;

export type CenterListItem = Prisma.CenterGetPayload<{
  select: typeof centerListSelect;
}>;
