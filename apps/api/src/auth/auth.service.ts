import {
  BadRequestException,
  HttpException,
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
import { AccountLimiter } from '../common/account-limiter.js';
import { SignInLockout } from '../common/sign-in-lockout.js';
import { type Mail, MailService } from '../mail/mail.service.js';
import {
  accountExistsMail,
  finishSignUpMail,
  resetPasswordMail,
  verifyEmailMail,
} from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
/** how long a used refresh token is still answered with a fresh pair (see refresh) */
export const REFRESH_REUSE_GRACE_MS = 2 * 60 * 1000;
/** every visitor shares the demo accounts, so each keeps only its newest sessions */
export const DEMO_SESSIONS_KEPT = 200;

const MINUTE_MS = 60 * 1000;
/** per address: five mistakes, then a minute's pause that doubles with every further failure, up to an hour */
const ADDRESS_LOCKOUT = {
  failuresBeforePause: 5,
  firstPauseMs: MINUTE_MS,
  maxPauseMs: 60 * MINUTE_MS,
  forgetAfterMs: 24 * 60 * MINUTE_MS,
};
/** per visitor address: wider, for someone trying many accounts from one place */
const NETWORK_LOCKOUT = { ...ADDRESS_LOCKOUT, failuresBeforePause: 20 };
/** a warning joins the error once this few attempts are left */
const WARN_WHEN_LEFT = 2;
const EMAILS_PER_ADDRESS = 3;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;

export const DEMO_EMAILS = { shopper: 'shopper@rakit.example', admin: 'admin@rakit.example' } as const;

const invalidCredentials = () => new UnauthorizedException('Email or password is incorrect');
const invalidSession = () => new UnauthorizedException('Session expired, sign in again');
const invalidLink = () => new BadRequestException('This link is invalid or has expired');

/** A 429 that says how long to wait; `retryAfter` (seconds) lets the sign-in form count down. */
function tooManySignIns(pauseMs: number): HttpException {
  const seconds = Math.ceil(pauseMs / 1000);
  const wait = seconds < 120 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minutes`;
  return new HttpException(
    {
      statusCode: 429,
      message: `Too many failed sign-ins. Try again in ${wait}.`,
      code: 'SIGN_IN_PAUSED',
      retryAfter: seconds,
    },
    429,
  );
}

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
    private readonly limiter: AccountLimiter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private readonly addressLockout = new SignInLockout(ADDRESS_LOCKOUT);
  private readonly networkLockout = new SignInLockout(NETWORK_LOCKOUT);

  // ── registration and email verification ───────────────────────────────────

  async register(input: RegisterInput): Promise<Message> {
    const reply = { message: 'Check your inbox to confirm your email address.' };
    // hashed before the lookup, so a taken address costs the same time as a new one (no timing oracle)
    const passwordHash = await hash(input.password);
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      // same reply either way: the response must not reveal whether the address has an account
      await this.handleExistingSignup(existing);
      return reply;
    }
    try {
      const user = await this.prisma.user.create({
        data: { name: input.name, email: input.email, passwordHash },
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
    // a fresh link sets a password rather than confirming the one on file: anyone can ask for this email, and
    // whoever signed up may not own the inbox (see sendFinishSignUp)
    if (user && !user.emailVerifiedAt && !user.isDemo) await this.sendFinishSignUp(user);
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

  async login(input: LoginInput, userAgent: string | undefined, clientIp = ''): Promise<IssuedSession> {
    // Two locks. Per address, not per IP: holds however many addresses a password guesser rotates through,
    // and applies the same way to unknown addresses, so it does not reveal which ones have accounts. Per
    // visitor address, wider: holds someone trying many accounts from one place.
    const address = `login:${input.email}`;
    const network = `ip:${clientIp}`;
    const paused = Math.max(this.addressLockout.pausedFor(address), this.networkLockout.pausedFor(network));
    if (paused > 0) throw tooManySignIns(paused);

    const failed = () => {
      const pause = Math.max(this.addressLockout.fail(address), this.networkLockout.fail(network));
      if (pause > 0) return tooManySignIns(pause);
      const left = this.addressLockout.attemptsLeft(address);
      if (left > WARN_WHEN_LEFT) return invalidCredentials();
      return new UnauthorizedException(
        `Email or password is incorrect. ${left} ${left === 1 ? 'attempt' : 'attempts'} left before sign-in pauses for a minute.`,
      );
    };
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.isDemo) {
      await verify(await this.dummyHash, input.password);
      throw failed();
    }
    if (!(await verify(user.passwordHash, input.password))) throw failed();
    this.addressLockout.succeed(address);
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
   * Rotates the refresh token. A token is exchanged once; presenting it again more than REFRESH_REUSE_GRACE_MS
   * after its first use means it was copied, so the whole session is revoked and both the thief and the owner
   * must sign in again. Within the window it is answered with a fresh pair instead: a phone whose reply was lost
   * (a cold-start timeout, a dropped network, the app killed before saving) or the loser of two concurrent
   * refreshes must not be signed out. Trade-off: a replay inside the window is answered too, so detecting a
   * stolen token is delayed by at most the window, not lost. Every refresh retires all unused tokens of the
   * session, so it never holds more than one live token, and the session's end date never moves.
   */
  async refresh(rawToken: string | undefined): Promise<IssuedSession> {
    if (!rawToken) throw invalidSession();
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { session: { include: { user: true } } },
    });
    if (!token) throw invalidSession();
    const { session } = token;

    const next = randomToken();
    const outcome = await this.prisma.$transaction(async (tx) => {
      // one refresh of a session at a time, so two inside the window cannot leave two live tokens
      const [locked] = await tx.$queryRaw<{ revokedAt: Date | null; expiresAt: Date }[]>`
        SELECT "revokedAt", "expiresAt" FROM "Session" WHERE "id" = ${session.id}::uuid FOR UPDATE`;
      const now = new Date();
      if (!locked || locked.revokedAt || locked.expiresAt <= now) return 'dead';
      const current = await tx.refreshToken.findUnique({ where: { id: token.id }, select: { usedAt: true } });
      if (!current) return 'dead';
      if (current.usedAt && now.getTime() - current.usedAt.getTime() > REFRESH_REUSE_GRACE_MS)
        return 'reused';
      await tx.refreshToken.updateMany({
        where: { sessionId: session.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.refreshToken.create({ data: { sessionId: session.id, tokenHash: sha256(next) } });
      await tx.session.update({ where: { id: session.id }, data: { lastUsedAt: now } });
      return 'rotated';
    });
    if (outcome === 'reused') {
      await this.revokeSession(session.id);
      this.logger.warn(`Refresh token reuse on session ${session.id}; session revoked`);
    }
    if (outcome !== 'rotated') throw invalidSession();
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
    if (user && !user.isDemo && this.mayEmail(user.email)) {
      const token = await this.issueEmailToken(user.id, EmailTokenPurpose.RESET_PASSWORD, RESET_TTL_MS);
      this.send(resetPasswordMail(user.email, user.name, this.link('/reset-password', token)));
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
    await this.pruneSessions(user.id);
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
    if (user.isDemo) await this.capDemoSessions(user.id);
    return this.issue(user, session.id, refreshToken, expiresAt);
  }

  /** Every "Try as …" opens a month-long session on a shared account: keep the newest (their tokens cascade). */
  private async capDemoSessions(userId: string): Promise<void> {
    const older = await this.prisma.session.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: DEMO_SESSIONS_KEPT,
      select: { id: true },
    });
    if (older.length > 0)
      await this.prisma.session.deleteMany({ where: { id: { in: older.map((s) => s.id) } } });
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

  /**
   * Housekeeping on each sign-in, scoped to this account: drop its sessions that ended over a week ago (their
   * tokens go with them). A week of history keeps reuse detection working for recently rotated tokens.
   */
  private async pruneSessions(userId: string): Promise<void> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await this.prisma.session.deleteMany({
      where: { userId, OR: [{ revokedAt: { lt: weekAgo } }, { expiresAt: { lt: weekAgo } }] },
    });
    await this.prisma.refreshToken.deleteMany({ where: { session: { userId }, usedAt: { lt: weekAgo } } });
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async handleExistingSignup(user: UserRow): Promise<void> {
    if (user.isDemo) return;
    if (!user.emailVerifiedAt) return this.sendFinishSignUp(user);
    if (!this.mayEmail(user.email)) return;
    const token = await this.issueEmailToken(user.id, EmailTokenPurpose.RESET_PASSWORD, RESET_TTL_MS);
    this.send(accountExistsMail(user.email, this.link('/reset-password', token)));
  }

  /**
   * An unconfirmed account asked about again (a second sign-up, or a new link). Whoever signed up first may not
   * own the inbox, so the password on file must never become live by a click from the inbox: earlier confirm
   * links are cancelled, and the one link sent sets a password, which also confirms the address.
   */
  private async sendFinishSignUp(user: UserRow): Promise<void> {
    if (!this.mayEmail(user.email)) return;
    const [, token] = await Promise.all([
      this.prisma.emailToken.deleteMany({
        where: { userId: user.id, purpose: EmailTokenPurpose.VERIFY_EMAIL, usedAt: null },
      }),
      // as long as the confirm link it replaces: this is how a new account gets finished
      this.issueEmailToken(user.id, EmailTokenPurpose.RESET_PASSWORD, VERIFY_TTL_MS),
    ]);
    this.send(finishSignUpMail(user.email, user.name, `${this.link('/reset-password', token)}&welcome=1`));
  }

  private async sendVerification(user: UserRow): Promise<void> {
    if (!this.mayEmail(user.email)) return;
    const token = await this.issueEmailToken(user.id, EmailTokenPurpose.VERIFY_EMAIL, VERIFY_TTL_MS);
    this.send(verifyEmailMail(user.email, user.name, this.link('/verify-email', token)));
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

  /**
   * At most EMAILS_PER_ADDRESS account emails an hour to one address, so the sign-up and reset forms cannot
   * flood an inbox. Checked before a new link is issued: issuing one cancels the earlier links of its kind,
   * so a skipped email must not leave the inbox holding only dead links. Over the cap nothing happens and the
   * reply stays the same.
   */
  private mayEmail(to: string): boolean {
    if (this.limiter.hit(`mail:${to}`, EMAIL_WINDOW_MS) <= EMAILS_PER_ADDRESS) return true;
    this.logger.warn('Email cap reached for an address; email skipped');
    return false;
  }

  /** Sends without awaiting: the reply time must not show whether an email went out. */
  private send(mail: Mail): void {
    void this.mail.send(mail);
  }

  private link(path: string, token: string): string {
    return `${this.env.WEB_ORIGIN}${path}?token=${token}`;
  }
}
