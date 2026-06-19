import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string; // id del usuario
  email: string;
  role: UserRole;
}
