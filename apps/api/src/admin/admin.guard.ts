import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../auth/access-token.guard.js';

/**
 * Runs after AccessTokenGuard on every /admin route. Administrators only; the shared demo administrator may
 * read (demo accounts only) but change nothing, because every visitor signs in to the same account.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    if (req.auth?.role !== 'ADMIN') throw new ForbiddenException('Administrators only');
    if (req.auth.isDemo && req.method !== 'GET') {
      throw new ForbiddenException('The demo administrator can look around but not change anything');
    }
    return true;
  }
}
