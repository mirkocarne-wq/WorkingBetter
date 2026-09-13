import { Module } from '@nestjs/common';
import { CoreController } from './core.controller.js';
import { OrgUnitsService } from './org-units.service.js';
import { PeopleService } from './people.service.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [CoreController],
  providers: [PeopleService, OrgUnitsService, UsersService],
  exports: [PeopleService, OrgUnitsService, UsersService],
})
export class CoreModule {}
