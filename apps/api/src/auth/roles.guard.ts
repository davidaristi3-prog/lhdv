import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import { JwtPayload } from './jwt-payload.interface';

/** Aplica el control por rol declarado con @Roles(). Corre después de JwtAuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly reflector = new Reflector();

  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    if (!req.user || !required.includes(req.user.role)) {
      throw new ForbiddenException('No tenés permiso para esta acción');
    }
    return true;
  }
}
