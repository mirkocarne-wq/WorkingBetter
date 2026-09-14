import { Controller, Get, Inject } from '@nestjs/common';
import { healthResponse } from '../common/responses.js';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import type { AnyDb } from '@wb/db';
import { Public } from '../auth/decorators.js';
import { ZOk } from '../common/zod.pipe.js';
import { DB } from '../db/db.module.js';

@ApiTags('system')
@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: AnyDb) {}

  @Public()
  @Get('health')
  @ZOk(healthResponse)
  async health() {
    await this.db.execute(sql`SELECT 1`);
    return { status: 'ok', db: 'ok', time: new Date().toISOString() };
  }
}
