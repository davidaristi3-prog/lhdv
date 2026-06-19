import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restringe una ruta a ciertos roles. Sin este decorador, cualquier usuario autenticado entra. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
