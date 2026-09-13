import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ErrorCodes } from '@wb/shared';
import { requestContext } from './context.js';

/** Risposte di errore in formato Problem Details (RFC 9457). */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly log = new Logger('Http');
  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const requestId = requestContext.getStore()?.requestId;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { type: 'about:blank', title: 'Errore interno', status, code: 'internal_error' };
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'code' in res) body = res as Record<string, unknown>;
      else {
        const map: Record<number, string> = { 401: ErrorCodes.UNAUTHENTICATED, 403: ErrorCodes.FORBIDDEN, 404: ErrorCodes.NOT_FOUND, 400: ErrorCodes.VALIDATION, 409: ErrorCodes.CONFLICT };
        const msg = typeof res === 'string' ? res : ((res as { message?: string | string[] }).message ?? exception.message);
        body = { type: 'about:blank', title: Array.isArray(msg) ? msg.join('; ') : msg, status, code: map[status] ?? 'http_error' };
      }
    } else {
      this.log.error(exception instanceof Error ? exception.stack : String(exception));
    }
    void reply.status(status).header('content-type', 'application/problem+json').send({ ...body, status, instance: requestId });
  }
}
