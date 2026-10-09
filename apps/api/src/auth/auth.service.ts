import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import type {
  ChangePasswordInput,
  DemoLoginInput,
  LoginInput,
  Message,
  RegisterInput,
  ResetPasswordInput,
  User,
} from '@gear-store/shared';
import { randomToken, sha256 } from '../common/tokens.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { EmailTokenPurpose, Prisma, type User as UserRow } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { accountExistsMail, resetPasswordMail, verifyEmailMail } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

export const DEMO_EMAILS = { shopper: 'shopper@rakit.example', admin: 'admin@rakit.example' } as const;

const invalidCredentials = () => new UnauthorizedException('Email or password is incorrect');
const invalidSession = () => new UnauthorizedException('Session expired, sign in again');
const invalidLink = () => new BadRequestException('This link is invalid or has expired');

export interface AccessClaims {
  sub: string;
  sid: string;
}

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  user: User;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    emailVerified: row.emailVerifiedAt !== null,
    isDemo: row.isDemo,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // verified against when the email is unknown, so a miss costs as long as a wrong password
  private readonly dummyHash = hash('timing-equaliser-not-a-real-password');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ── registration and email verification ───────────────────────────────────

  async register(input: RegisterInput): Promise<Message> {
    const reply = { message: 'Check your inbox to confirm your email address.' };
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      // same reply either way: the response must not reveal whether the address has an account
      await this.handleExistingSignup(existing);
      return reply;
    }
    try {
      const user = await this.prisma.user.create({
        data: { name: input.name, email: input.email, passwordHash: await hash(input.password) },
      });
      await this.sendVerification(user);
    } catch (error) {
      // two sign-ups for one address at the same moment: the loser is treated like an existing account
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
    return reply;
  }

  async resendVerification(email: string): Promise<Message> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerifiedAt && !user.isDemo) await this.sendVerification(user);
    return { message: 'If that address has an unconfirmed account, a new link is on its way.' };
  }

  async verifyEmail(token: string): Promise<Message> {
    await this.prisma.$transaction(async (tx) => {
      const row = await this.consumeEmailToken(tx, token, EmailTokenPurpose.VERIFY_EMAIL);
      await tx.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
    });
    return { message: 'Email confirmed. You can sign in now.' };
  }

  // ── sign in, refresh, sign out ────────────────────────────────────────────

  async login(input: LoginInput, userAgent: string | undefined): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.isDemo) {
      await verify(await this.dummyHash, input.password);
      throw invalidCredentials();
    }
    if (!(await verify(user.passwordHash, input.password))) throw invalidCredentials();
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Confirm your email address before signing in.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    return this.startSession(user, userAgent);
  }

  async demoLogin(input: DemoLoginInput, userAgent: string | undefined): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: DEMO_EMAILS[input.role] } });
    if (!user?.isDemo) throw new ServiceUnavailableException('Demo accounts are not set up');
    return this.startSession(user, userAgent);
  }

  /**
   * Rotates the refresh token. A token can be exchanged once; presenting it again means it was copied, so the
   * whole session is revoked and both the thief and the owner must sign in again.
   */
  async refresh(rawToken: string | undefined): Promise<IssuedSession> {
    if (!rawToken) throw invalidSession();
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { session: { include: { user: true } } },
    });
    if (!token) throw invalidSession();
    const { session } = token;
    if (session.revokedAt || session.expiresAt <= new Date()) throw invalidSession();
    if (token.usedAt) {
      await this.revokeSession(session.id);
      this.logger.warn(`Refresh token reuse on session ${session.id}; session revoked`);
      throw invalidSession();
    }

    const next = randomToken();
    const rotated = await this.prisma.$transaction(async (tx) => {
      // conditional update: of two concurrent refreshes with the same token, exactly one wins
      const claimed = await tx.refreshToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) return false;
      await tx.refreshToken.create({ data: { sessionId: session.id, tokenHash: sha256(next) } });
      await tx.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
      return true;
    });
    if (!rotated) {
      await this.revokeSession(session.id);
      throw invalidSession();
    }
    return this.issue(session.user, session.id, next, session.expiresAt);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const token = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (token) await this.revokeSession(token.sessionId);
  }

  // ── passwords ─────────────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<Message> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.isDemo) {
      const token = await this.issueEmailToken(user.id, EmailTokenPurpose.RESET_PASSWORD, RESET_TTL_MS);
      await this.mail.send(resetPasswordMail(user.email, user.name, this.link('/reset-password', token)));
    }
    return { message: 'If that address has an account, a reset link is on its way.' };
  }

  async resetPassword(input: ResetPasswordInput): Promise<Message> {
    const passwordHash = await hash(input.password);
    await this.prisma.$transaction(async (tx) => {
      const row = await this.consumeEmailToken(tx, input.token, EmailTokenPurpose.RESET_PASSWORD);
      const now = new Date();
      await tx.user.update({
        where: { id: row.userId },
        // the link proved they read this inbox, which also confirms the address
        data: { passwordHash, emailVerifiedAt: row.user.emailVerifiedAt ?? now },
      });
      await tx.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
    return { message: 'Password changed. Sign in with your new password.' };
  }

  async changePassword(userId: string, sessionId: string, input: ChangePasswordInput): Promise<Message> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.isDemo) throw new ForbiddenException('Demo accounts cannot change their password');
    if (!(await verify(user.passwordHash, input.currentPassword))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await hash(input.newPassword) },
      }),
      // other devices sign out; this one stays signed in
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, id: { not: sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: 'Password changed. Other devices have been signed out.' };
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async startSession(user: UserRow, userAgent: string | undefined): Promise<IssuedSession> {
    const refreshToken = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        userAgent: userAgent?.slice(0, 255),
        expiresAt,
        refreshTokens: { create: { tokenHash: sha256(refreshToken) } },
      },
    });
    return this.issue(user, session.id, refreshToken, expiresAt);
  }

  private async issue(user: UserRow, sessionId: string, refreshToken: string, expiresAt: Date) {
    const claims: AccessClaims = { sub: user.id, sid: sessionId };
    return {
      accessToken: await this.jwt.signAsync(claims),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: toUser(user),
      refreshToken,
      refreshExpiresAt: expiresAt,
    };
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async handleExistingSignup(user: UserRow): Promise<void> {
    if (user.isDemo) return;
    if (!user.emailVerifiedAt) return this.sendVerification(user);
    const token = await this.issueEmailToken(user.id, EmailTokenPurpose.RESET_PASSWORD, RESET_TTL_MS);
    await this.mail.send(accountExistsMail(user.email, this.link('/reset-password', token)));
  }

  private async sendVerification(user: UserRow): Promise<void> {
    const token = await this.issueEmailToken(user.id, EmailTokenPurpose.VERIFY_EMAIL, VERIFY_TTL_MS);
    await this.mail.send(verifyEmailMail(user.email, user.name, this.link('/verify-email', token)));
  }

  /** A new link replaces any earlier unused one of the same kind. */
  private async issueEmailToken(userId: string, purpose: EmailTokenPurpose, ttlMs: number): Promise<string> {
    const token = randomToken();
    await this.prisma.$transaction([
      this.prisma.emailToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
      this.prisma.emailToken.create({
        data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
      }),
    ]);
    return token;
  }

  private async consumeEmailToken(tx: Prisma.TransactionClient, token: string, purpose: EmailTokenPurpose) {
    const row = await tx.emailToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!row || row.purpose !== purpose || row.expiresAt <= new Date()) throw invalidLink();
    const claimed = await tx.emailToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw invalidLink();
    return row;
  }

  private link(path: string, token: string): string {
    return `${this.env.WEB_ORIGIN}${path}?token=${token}`;
  }
}
