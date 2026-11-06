import { AppRole } from '../../../common/enums/app-role.enum';
import { UserRole } from '@prisma/client';

export interface AuthUserInfo {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole | typeof AppRole.SUPER_ADMIN;
  centerId: string | null;
  mustChangePassword: boolean;
  center?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface AuthLoginResponse {
  accessToken: string;
  user: AuthUserInfo;
}

export interface SuperAdminUserInfo {
  id: string;
  fullName: string;
  email: string;
  phone: null;
  role: typeof AppRole.SUPER_ADMIN;
  centerId: null;
  mustChangePassword: false;
}

export interface SuperAdminLoginResponse {
  accessToken: string;
  user: SuperAdminUserInfo;
}
