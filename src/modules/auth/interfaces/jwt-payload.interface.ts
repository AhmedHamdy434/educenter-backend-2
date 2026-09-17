import { AppRole } from '../../../common/enums/app-role.enum';

export interface JwtPayload {
  sub: string;
  centerId?: string | null;
  role: AppRole;
}
