import { Module } from '@nestjs/common';
import { CoreController } from './core.controller.js';
import { OrgUnitsService } from './org-units.service.js';
import { PeopleService } from './people.service.js';
import { PeopleImportService } from './people-import.service.js';
import { PersonFieldsService } from './person-fields.service.js';
import { NamingService } from './naming.service.js';
import { RolesService } from './roles.service.js';
import { AccessService } from './access.service.js';
import { SettingsController } from './settings.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [CoreController, SettingsController],
  providers: [PeopleService, OrgUnitsService, UsersService, PeopleImportService, PersonFieldsService, NamingService, RolesService, AccessService],
  exports: [PeopleService, OrgUnitsService, UsersService, PeopleImportService, PersonFieldsService, NamingService, RolesService],
})
export class CoreModule {}
