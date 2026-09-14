import { Body, Injectable, Query, type PipeTransform } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { ZodType, ZodTypeDef } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
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

type AnySchema = ZodType<unknown, ZodTypeDef, unknown>;
type JsonSchema = Record<string, unknown>;

/** JSON Schema (dialetto OpenAPI 3) da uno schema Zod, senza $ref né $schema: è ciò che finisce nel contratto pubblicato. */
export function toOpenApiSchema(schema: AnySchema): JsonSchema {
  const out = zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as JsonSchema;
  delete out.$schema;
  return out;
}

/** Rimuove i wrapper (refine/transform/default) per arrivare all'oggetto con le chiavi della query. */
function unwrap(schema: AnySchema): AnySchema {
  let s = schema as AnySchema & { _def: { typeName?: string; schema?: AnySchema; innerType?: AnySchema } };
  for (let i = 0; i < 8; i++) {
    const t = s._def.typeName;
    if (t === 'ZodEffects' && s._def.schema) s = s._def.schema as typeof s;
    else if ((t === 'ZodDefault' || t === 'ZodOptional' || t === 'ZodNullable') && s._def.innerType) s = s._def.innerType as typeof s;
    else break;
  }
  return s;
}

function descriptorOf(target: object, key: string | symbol | undefined): PropertyDescriptor | undefined {
  return key === undefined ? undefined : Object.getOwnPropertyDescriptor(target, key);
}

/**
 * Body validato con Zod e descritto in OpenAPI con lo stesso schema (ADR-0009):
 * il contratto pubblicato e la validazione a runtime non possono divergere.
 */
export function ZBody<T>(schema: ZodType<T, ZodTypeDef, unknown>): ParameterDecorator {
  return (target, key, index) => {
    Body(new ZodValidationPipe(schema))(target, key, index);
    const d = descriptorOf(target, key);
    if (d) ApiBody({ required: true, schema: toOpenApiSchema(schema) as never })(target, key!, d);
  };
}

/** Query string validata con Zod; ogni chiave dell'oggetto diventa un parametro OpenAPI con tipo e obbligatorietà. */
export function ZQuery<T>(schema: ZodType<T, ZodTypeDef, unknown>): ParameterDecorator {
  return (target, key, index) => {
    Query(new ZodValidationPipe(schema))(target, key, index);
    const d = descriptorOf(target, key);
    if (!d) return;
    const obj = unwrap(schema) as AnySchema & { shape?: Record<string, AnySchema> };
    const shape = typeof obj.shape === 'function' ? (obj.shape as unknown as () => Record<string, AnySchema>)() : obj.shape;
    if (!shape) return;
    for (const [name, field] of Object.entries(shape)) {
      const required = !field.isOptional() && (field as { _def: { typeName?: string } })._def.typeName !== 'ZodDefault';
      const json = toOpenApiSchema(unwrap(field));
      if (!required && json.default === undefined) {
        const def = (field as { _def: { defaultValue?: () => unknown } })._def.defaultValue;
        if (typeof def === 'function') json.default = def();
      }
      ApiQuery({ name, required, schema: json as never, description: typeof json.description === 'string' ? json.description : undefined })(target, key!, d);
    }
  };
}

/** Schema della risposta (default 200) nel contratto OpenAPI. */
export function ZOk(schema: AnySchema, status = 200): MethodDecorator {
  return ApiResponse({ status, schema: toOpenApiSchema(schema) as never });
}
