import { Prisma } from '@prisma/client';

export const userDetailsSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  avatar: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  centerId: true,
  createdAt: true,
  center: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
} satisfies Prisma.UserSelect;

export const userListSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  avatar: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  centerId: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type UserDetails = Prisma.UserGetPayload<{
  select: typeof userDetailsSelect;
}>;

export type UserListItem = Prisma.UserGetPayload<{
  select: typeof userListSelect;
}>;
