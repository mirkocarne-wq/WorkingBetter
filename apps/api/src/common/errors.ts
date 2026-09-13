import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes, type ErrorCode } from '@wb/shared';

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: ErrorCode | string;
  errors?: unknown;
}

export class AppError extends HttpException {
  constructor(status: HttpStatus, code: ErrorCode | string, title: string, detail?: string, errors?: unknown) {
    const body: ProblemBody = { type: `https://docs.workingbetter.app/errors/${code}`, title, status, code };
    if (detail) body.detail = detail;
    if (errors) body.errors = errors;
    super(body, status);
  }
}

export const notFound = (entity: string, id?: string) =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCodes.NOT_FOUND, `${entity} non trovato`, id ? `${entity} ${id} non esiste o non è visibile` : undefined);
export const forbidden = (detail?: string) => new AppError(HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN, 'Operazione non consentita', detail);
export const conflict = (code: ErrorCode, detail: string) => new AppError(HttpStatus.CONFLICT, code, 'Conflitto', detail);
export const unprocessable = (code: ErrorCode, detail: string) => new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, 'Richiesta non processabile', detail);
export const validation = (errors: unknown) => new AppError(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION, 'Dati non validi', undefined, errors);
