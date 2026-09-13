import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { hasPermission, type Permission } from '@wb/shared';
import { IS_PUBLIC, PERMISSIONS } from './decorators.js';
import { TokenService } from './token.service.js';
import { requestContext } from '../common/context.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Token mancante');
    let principal;
    try {
      principal = await this.tokens.verify(header.slice(7));
    } catch {
      throw new UnauthorizedException('Token non valido');
    }
    const store = requestContext.getStore();
    if (store) store.principal = principal;
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS, targets);
    if (required?.length && !required.some((p) => hasPermission(principal.roles, p))) {
      throw new ForbiddenException(`Permesso richiesto: ${required.join(' | ')}`);
    }
    return true;
  }
}
