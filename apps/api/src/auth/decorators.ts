import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@wb/shared';
import { principal } from '../common/context.js';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS = 'permissions';
/** Richiede che il principal abbia almeno uno dei permessi indicati. */
export const RequirePermission = (...perms: Permission[]) => SetMetadata(PERMISSIONS, perms);

export const PLATFORM_ONLY = 'platformOnly';
/** Rotta della console di piattaforma: accetta solo token con claim `platform` e rifiuta i token tenant (ADR-0013). */
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY, true);

export const CurrentPrincipal = createParamDecorator((_data: unknown, _ctx: ExecutionContext) => principal());
