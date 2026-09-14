import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformService } from './platform.service.js';

/** Console di piattaforma (ADR-0013): rotte /platform riservate ai token con claim `platform`. */
@Module({ controllers: [PlatformController], providers: [PlatformAuthService, PlatformService] })
export class PlatformModule {}
