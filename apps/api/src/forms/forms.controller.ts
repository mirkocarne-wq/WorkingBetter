import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { FormsService } from './forms.service.js';

const uuid = z.string().uuid();
const key = z.string().regex(/^[a-z][a-z0-9_]{0,60}$/);
const createDto = z.object({ key, name: z.string().min(1).max(200), kind: z.enum(['generic', 'review', 'survey', 'onboarding', 'request', 'feedback360', 'app']).default('generic'), schema: z.unknown().refine((v) => v !== undefined, 'schema richiesto') }).transform((v) => ({ ...v, schema: v.schema as unknown }));
const updateDto = z.object({ name: z.string().min(1).max(200).optional(), schema: z.unknown().optional() });
const listQuery = z.object({ kind: z.string().optional(), status: z.enum(['draft', 'published', 'archived']).optional(), latest: z.coerce.boolean().optional() });
const scaleLabels = z.record(z.string().regex(/^-?\d+$/), z.string().min(1).max(80));
const createScaleDto = z.object({ key, name: z.string().min(1).max(120), min: z.number().int().min(-100).max(100).default(1), max: z.number().int().min(-100).max(100).default(5), labels: scaleLabels.optional(), allowNa: z.boolean().optional() });
const updateScaleDto = z.object({ name: z.string().min(1).max(120).optional(), min: z.number().int().min(-100).max(100).optional(), max: z.number().int().min(-100).max(100).optional(), labels: scaleLabels.optional(), allowNa: z.boolean().optional(), archived: z.boolean().optional() });
const listScalesQuery = z.object({ includeArchived: z.coerce.boolean().optional() });
const createResponseDto = z.object({ formDefinitionId: uuid.optional(), formKey: key.optional(), respondentPersonId: uuid.optional(), subjectPersonId: uuid.optional(), contextType: z.string().max(40).optional(), contextId: uuid.optional(), dueDate: z.string().datetime().optional(), notify: z.boolean().optional() });
const listResponsesQuery = z.object({ mine: z.coerce.boolean().optional(), formKey: key.optional(), status: z.enum(['draft', 'submitted']).optional(), subjectPersonId: uuid.optional() });
const answersDto = z.object({ answers: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])) });
const submitDto = z.object({ answers: answersDto.shape.answers.optional() });

@ApiTags('forms')
@ApiBearerAuth()
@Controller()
export class FormsController {
  constructor(private readonly svc: FormsService) {}

  @Get('forms') @RequirePermission(Permissions.FORMS_RESPOND) list(@ZQuery(listQuery) q: z.infer<typeof listQuery>) { return this.svc.list(q); }
  @Get('forms/:id') @RequirePermission(Permissions.FORMS_RESPOND) get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Post('forms') @RequirePermission(Permissions.FORMS_MANAGE) @ApiOperation({ summary: 'Crea una definizione di form (bozza) a partire da uno schema dichiarativo' }) create(@ZBody(createDto) b: z.infer<typeof createDto>) { return this.svc.create(b); }
  @Patch('forms/:id') @RequirePermission(Permissions.FORMS_MANAGE) update(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateDto) b: z.infer<typeof updateDto>) { return this.svc.update(id, b); }
  @Post('forms/:id/publish') @RequirePermission(Permissions.FORMS_MANAGE) publish(@Param('id', ParseUUIDPipe) id: string) { return this.svc.publish(id); }
  @Post('forms/:id/versions') @RequirePermission(Permissions.FORMS_MANAGE) newVersion(@Param('id', ParseUUIDPipe) id: string) { return this.svc.newVersion(id); }

  // scale riutilizzabili del tenant (APP-005)
  @Get('form-scales') @RequirePermission(Permissions.FORMS_RESPOND) @ApiOperation({ summary: 'Scale riutilizzabili del tenant (APP-005): nome, intervallo, etichette, N/A' }) listScales(@ZQuery(listScalesQuery) q: z.infer<typeof listScalesQuery>) { return this.svc.listScales(q.includeArchived); }
  @Post('form-scales') @RequirePermission(Permissions.FORMS_MANAGE) @ApiOperation({ summary: 'Crea una scala riutilizzabile' }) createScale(@ZBody(createScaleDto) b: z.infer<typeof createScaleDto>) { return this.svc.createScale(b); }
  @Patch('form-scales/:id') @RequirePermission(Permissions.FORMS_MANAGE) @ApiOperation({ summary: 'Aggiorna o archivia una scala (non tocca i form già pubblicati)' }) updateScale(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateScaleDto) b: z.infer<typeof updateScaleDto>) { return this.svc.updateScale(id, b); }

  @Get('form-responses') @RequirePermission(Permissions.FORMS_RESPOND) listResponses(@ZQuery(listResponsesQuery) q: z.infer<typeof listResponsesQuery>) { return this.svc.listResponses(q); }
  @Post('form-responses') @RequirePermission(Permissions.FORMS_RESPOND) createResponse(@ZBody(createResponseDto) b: z.infer<typeof createResponseDto>) { return this.svc.createResponse(b); }
  @Get('form-responses/:id') @RequirePermission(Permissions.FORMS_RESPOND) getResponse(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getResponse(id); }
  @Put('form-responses/:id/draft') @RequirePermission(Permissions.FORMS_RESPOND) draft(@Param('id', ParseUUIDPipe) id: string, @ZBody(answersDto) b: z.infer<typeof answersDto>) { return this.svc.saveDraft(id, b.answers); }
  @Post('form-responses/:id/validate') @RequirePermission(Permissions.FORMS_RESPOND) validate(@Param('id', ParseUUIDPipe) id: string, @ZBody(answersDto) b: z.infer<typeof answersDto>) { return this.svc.validate(id, b.answers); }
  @Post('form-responses/:id/submit') @RequirePermission(Permissions.FORMS_RESPOND) submit(@Param('id', ParseUUIDPipe) id: string, @ZBody(submitDto) b: z.infer<typeof submitDto>) { return this.svc.submit(id, b.answers); }
}
