import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { adjustDto, batchDto, catalogItemDto, categoryDto, createPlanDto, createRequestDto, decideDto, declarationDto, initiativeDto, premiumChoiceDto, requestsQuery, simulateQuery, sourceDto, thresholdsPutDto, updatePlanDto } from './dto.js';
import { WelfareAdminService } from './welfare-admin.service.js';
import { WelfareService } from './welfare.service.js';

const U = Permissions.WELFARE_USE;
const M = Permissions.WELFARE_MANAGE;
const P = Permissions.WELFARE_PAYROLL;
const yearQ = z.object({ year: z.coerce.number().int().min(2020).max(2100).default(new Date().getFullYear()) });
const planQ = z.object({ planId: z.string().uuid().optional() });

@ApiTags('welfare')
@ApiBearerAuth()
@Controller('welfare')
export class WelfareController {
  constructor(private readonly svc: WelfareService, private readonly admin: WelfareAdminService) {}

  // ---- dipendente ----
  @Get('me') @RequirePermission(U) @ApiOperation({ summary: 'Il mio welfare: piani, saldo, movimenti, richieste, categorie con cumulo e soglie, catalogo, dichiarazioni, iniziative, premio' }) me() { return this.svc.myOverview(); }
  @Post('requests') @RequirePermission(U) @ApiOperation({ summary: 'Nuova richiesta (rimborso, voucher, servizio): prenota il budget e calcola l’eccedenza sulla soglia' }) createRequest(@ZBody(createRequestDto) b: z.infer<typeof createRequestDto>) { return this.svc.createRequest(b); }
  @Post('requests/:id/cancel') @RequirePermission(U) cancel(@Param('id', ParseUUIDPipe) id: string) { return this.svc.cancelRequest(id); }
  @Put('declarations') @RequirePermission(U) @ApiOperation({ summary: 'Dichiarazione annuale (es. figli a carico) che seleziona la variante di soglia' }) declare(@ZBody(declarationDto) b: z.infer<typeof declarationDto>) { return this.svc.declare(b); }
  @Post('initiatives/:id/join') @RequirePermission(U) join(@Param('id', ParseUUIDPipe) id: string) { return this.svc.joinInitiative(id, true); }
  @Post('initiatives/:id/leave') @RequirePermission(U) leave(@Param('id', ParseUUIDPipe) id: string) { return this.svc.joinInitiative(id, false); }
  @Get('premium/simulate') @RequirePermission(U) @ApiOperation({ summary: 'Simulatore indicativo cash vs welfare' }) simulate(@ZQuery(simulateQuery) q: z.infer<typeof simulateQuery>) { return this.svc.simulate(q.planId, q.percent); }
  @Post('premium/choice') @RequirePermission(U) @ApiOperation({ summary: 'Scelta irrevocabile di conversione del premio (nella finestra, con presa visione del regolamento)' }) choose(@ZBody(premiumChoiceDto) b: z.infer<typeof premiumChoiceDto>) { return this.svc.choosePremium(b); }

  // ---- amministrazione ----
  @Get('categories') @RequirePermission(U) categories() { return this.admin.listCategories(); }
  @Put('categories') @RequirePermission(M) upsertCategory(@ZBody(categoryDto) b: z.infer<typeof categoryDto>) { return this.admin.upsertCategory(b); }
  @Post('presets') @RequirePermission(M) @ApiOperation({ summary: 'Carica categorie e soglie di riferimento per l’anno (indicative, da verificare)' }) presets(@ZQuery(yearQ) q: z.infer<typeof yearQ>) { return this.admin.loadPresets(q.year); }
  @Get('thresholds') @RequirePermission(M) thresholds(@ZQuery(yearQ) q: z.infer<typeof yearQ>) { return this.admin.listThresholds(q.year); }
  @Put('thresholds') @RequirePermission(M) putThresholds(@ZBody(thresholdsPutDto) b: z.infer<typeof thresholdsPutDto>) { return this.admin.putThresholds(b); }

  @Get('plans') @RequirePermission(M) plans() { return this.admin.listPlans(); }
  @Post('plans') @RequirePermission(M) createPlan(@ZBody(createPlanDto) b: z.infer<typeof createPlanDto>) { return this.admin.createPlan(b); }
  @Get('plans/:id') @RequirePermission(M) plan(@Param('id', ParseUUIDPipe) id: string) { return this.admin.getPlan(id); }
  @Patch('plans/:id') @RequirePermission(M) updatePlan(@Param('id', ParseUUIDPipe) id: string, @ZBody(updatePlanDto) b: z.infer<typeof updatePlanDto>) { return this.admin.updatePlan(id, b); }
  @Post('plans/:id/activate') @RequirePermission(M) @ApiOperation({ summary: 'Attiva il piano e accredita le fonti con data raggiunta (pro-rata per gli ingressi in corso d’anno)' }) activate(@Param('id', ParseUUIDPipe) id: string) { return this.admin.activatePlan(id); }
  @Post('plans/:id/close') @RequirePermission(M) @ApiOperation({ summary: 'Chiude il piano applicando la regola di roll-over al residuo' }) close(@Param('id', ParseUUIDPipe) id: string) { return this.admin.closePlan(id); }
  @Post('plans/:id/sources') @RequirePermission(M) addSource(@Param('id', ParseUUIDPipe) id: string, @ZBody(sourceDto) b: z.infer<typeof sourceDto>) { return this.admin.addSource(id, b); }
  @Post('adjustments') @RequirePermission(M) @ApiOperation({ summary: 'Ricarica o storno manuale con motivazione (WEL-005)' }) adjust(@ZBody(adjustDto) b: z.infer<typeof adjustDto>) { return this.admin.adjust(b); }

  @Get('catalog') @RequirePermission(U) catalog(@ZQuery(planQ) q: z.infer<typeof planQ>) { return this.admin.listCatalog(q.planId); }
  @Post('catalog') @RequirePermission(M) createItem(@ZBody(catalogItemDto) b: z.infer<typeof catalogItemDto>) { return this.admin.upsertCatalogItem(b); }
  @Patch('catalog/:id') @RequirePermission(M) updateItem(@Param('id', ParseUUIDPipe) id: string, @ZBody(catalogItemDto) b: z.infer<typeof catalogItemDto>) { return this.admin.upsertCatalogItem(b, id); }
  @Get('initiatives') @RequirePermission(U) initiatives() { return this.admin.listInitiatives(); }
  @Post('initiatives') @RequirePermission(M) createInitiative(@ZBody(initiativeDto) b: z.infer<typeof initiativeDto>) { return this.admin.upsertInitiative(b); }

  @Get('requests') @RequirePermission(M) @ApiOperation({ summary: 'Coda richieste (status=open | approved | …)' }) requests(@ZQuery(requestsQuery) q: z.infer<typeof requestsQuery>) { return this.svc.listRequests(q); }
  @Post('requests/:id/decide') @RequirePermission(M) decide(@Param('id', ParseUUIDPipe) id: string, @ZBody(decideDto) b: z.infer<typeof decideDto>) { return this.svc.decide(id, b); }

  @Get('payroll/preview') @RequirePermission(P) payrollPreview() { return this.admin.payrollPreview(); }
  @Get('payroll/batches') @RequirePermission(P) batches() { return this.admin.listBatches(); }
  @Post('payroll/batches') @RequirePermission(P) @ApiOperation({ summary: 'Crea il lotto payroll con rimborsi approvati ed eccedenze imponibili' }) createBatch(@ZBody(batchDto) b: z.infer<typeof batchDto>) { return this.admin.createBatch(b); }
  @Get('payroll/batches/:id/csv') @RequirePermission(P)
  async csv(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="welfare-payroll-${id.slice(0, 8)}.csv"`);
    return this.admin.batchCsv(id);
  }
  @Post('payroll/batches/:id/confirm') @RequirePermission(P) @ApiOperation({ summary: 'Conferma liquidazione: le richieste passano a "pagata"' }) confirm(@Param('id', ParseUUIDPipe) id: string) { return this.admin.confirmBatch(id); }
}
