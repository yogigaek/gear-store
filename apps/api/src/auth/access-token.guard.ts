import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AccessClaims } from './auth.service.js';

export interface AuthContext {
  userId: string;
  sessionId: string;
  role: Role;
  isDemo: boolean;
}

type AuthedRequest = Request & { auth?: AuthContext };

/**
 * Bearer access token plus a live-session check, so signing out or a password reset takes effect at once
 * instead of when the 15-minute token runs out. The role comes from the database, never from the token.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Sign in to continue');

    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token);
    } catch {
      throw new UnauthorizedException('Sign in to continue');
    }

    const session = await this.prisma.session.findFirst({
      where: { id: claims.sid, userId: claims.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { user: { select: { role: true, isDemo: true } } },
    });
    if (!session) throw new UnauthorizedException('Session expired, sign in again');

    req.auth = {
      userId: claims.sub,
      sessionId: claims.sid,
      role: session.user.role,
      isDemo: session.user.isDemo,
    };
    return true;
  }
}

export const CurrentAuth = createParamDecorator((_: unknown, context: ExecutionContext): AuthContext => {
  const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new UnauthorizedException('Sign in to continue');
  return auth;
});
