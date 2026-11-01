import { type ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';

const plain: Record<string, { statusCode: number; message: string }> = {
  P2002: {
    statusCode: HttpStatus.CONFLICT,
    message: 'That was just saved by another request. Reload and try again.',
  },
  P2025: { statusCode: HttpStatus.NOT_FOUND, message: 'Not found' },
};

/** A unique key clash is a 409 and a missing row a 404, in plain words; other database errors stay a 500. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  override catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const reply = plain[error.code];
    if (!reply) return super.catch(error, host);
    // a code path that lets these through is still a bug to find; the code and model name it, values never
    const model = typeof error.meta?.['modelName'] === 'string' ? error.meta['modelName'] : 'unknown model';
    this.logger.warn(`${error.code} on ${model}, answered ${reply.statusCode}`);
    host.switchToHttp().getResponse<Response>().status(reply.statusCode).json(reply);
  }
}
