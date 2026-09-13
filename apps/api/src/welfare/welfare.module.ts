import { Module } from '@nestjs/common';
import { WelfareAdminService } from './welfare-admin.service.js';
import { WelfareController } from './welfare.controller.js';
import { WelfareService } from './welfare.service.js';

@Module({ controllers: [WelfareController], providers: [WelfareAdminService, WelfareService], exports: [WelfareAdminService, WelfareService] })
export class WelfareModule {}
