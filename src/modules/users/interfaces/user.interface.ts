import { Prisma } from '@prisma/client';
import { userDetailsSelect, userListSelect } from '../constants/user.select';

export type UserDetails = Prisma.UserGetPayload<{
  select: typeof userDetailsSelect;
}>;

export type UserListItem = Prisma.UserGetPayload<{
  select: typeof userListSelect;
}>;

export type UserWithCenter = Prisma.UserGetPayload<{
  include: {
    center: {
      select: {
        id: true;
        name: true;
        slug: true;
      };
    };
  };
}>;

export interface CreateUserAccountInput {
  fullName: string;
  email: string;
  password?: string;
  phone?: string;
  avatar?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export interface UpdateUserAccountInput {
  fullName?: string;
  email?: string;
  password?: string;
  phone?: string;
  avatar?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}
