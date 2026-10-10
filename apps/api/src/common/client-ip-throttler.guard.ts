import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { loadEnv } from '../config/env.js';
import { clientIp } from './client-ip.js';

/** The standard throttler, keyed by the visitor address from clientIp() instead of the raw req.ip. */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  private readonly ipHeaders = loadEnv().CLIENT_IP_HEADERS;

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(clientIp(req as unknown as Request, this.ipHeaders));
  }
}
