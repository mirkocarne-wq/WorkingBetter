import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';
import { validation } from './errors.js';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) throw validation(r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    return r.data;
  }
}
