import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@wb/shared';
import { principal } from '../common/context.js';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS = 'permissions';
/** Richiede che il principal abbia almeno uno dei permessi indicati. */
export const RequirePermission = (...perms: Permission[]) => SetMetadata(PERMISSIONS, perms);

export const CurrentPrincipal = createParamDecorator((_data: unknown, _ctx: ExecutionContext) => principal());
