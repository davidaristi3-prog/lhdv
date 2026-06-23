import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtPayload } from './jwt-payload.interface';

/** Verifica el Bearer token en cada request, salvo en rutas marcadas @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly reflector = new Reflector();

  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token de autenticación');
    }

    try {
      req.user = await this.jwt.verifyAsync<JwtPayload>(auth.slice(7));
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
