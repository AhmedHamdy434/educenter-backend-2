import { Request } from 'express';
import { JwtPayload } from './jwt-payload.interface';

export interface RequestUser extends Omit<JwtPayload, 'sub'> {
  id: string;
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}
