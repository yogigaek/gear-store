import {
  applyDecorators,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  authResponseSchema,
  demoLoginSchema,
  emailOnlySchema,
  loginSchema,
  messageSchema,
  nativeAuthResponseSchema,
  refreshTokenInputSchema,
  registerSchema,
  resetPasswordSchema,
  tokenOnlySchema,
  type AuthResponse,
  type DemoLoginInput,
  type LoginInput,
  type Message,
  type NativeAuthResponse,
  type RefreshTokenInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@gear-store/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { clientIp } from '../common/client-ip.js';
import { openApiSchema } from '../common/openapi.js';
import { FIVE_PER_MINUTE, TEN_PER_MINUTE } from '../common/throttle.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AuthService, type IssuedSession } from './auth.service.js';

export const REFRESH_COOKIE = 'rakit_rt';
const COOKIE_PATH = '/api/auth';

const body = <S extends z.ZodType>(schema: S) => new ZodValidationPipe(schema);
const ApiContract = (input: z.ZodType, output: z.ZodType = messageSchema) =>
  applyDecorators(
    ApiBody({ schema: openApiSchema(input, 'input') }),
    ApiOkResponse({ schema: openApiSchema(output) }),
  );

// named fields only: whatever IssuedSession gains later stays out of the reply until it is added here
const toNative = (issued: IssuedSession): NativeAuthResponse => ({
  accessToken: issued.accessToken,
  expiresIn: issued.expiresIn,
  user: issued.user,
  refreshToken: issued.refreshToken,
  refreshExpiresAt: issued.refreshExpiresAt.toISOString(),
});

@ApiTags('Auth')
@Controller('auth')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('register')
  @HttpCode(202)
  @Throttle(FIVE_PER_MINUTE)
  @ApiOperation({
    summary: 'Create an account; a confirmation link is emailed. Same reply if the email is taken.',
  })
  @ApiContract(registerSchema)
  register(@Body(body(registerSchema)) input: RegisterInput): Promise<Message> {
    return this.auth.register(input);
  }

  @Post('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm an email address with the token from the link' })
  @ApiContract(tokenOnlySchema)
  verifyEmail(@Body(body(tokenOnlySchema)) input: { token: string }): Promise<Message> {
    return this.auth.verifyEmail(input.token);
  }

  @Post('resend-verification')
  @HttpCode(202)
  @Throttle(FIVE_PER_MINUTE)
  @ApiOperation({ summary: 'Send a new confirmation link' })
  @ApiContract(emailOnlySchema)
  resend(@Body(body(emailOnlySchema)) input: { email: string }): Promise<Message> {
    return this.auth.resendVerification(input.email);
  }

  @Post('login')
  @HttpCode(200)
  // looser than the other auth routes: the escalating pauses in AuthService.login are the real limit, and
  // they answer with how long to wait, which a plain throttler 429 cannot
  @Throttle(TEN_PER_MINUTE)
  @ApiOperation({ summary: 'Sign in; sets the refresh cookie and returns an access token' })
  @ApiContract(loginSchema, authResponseSchema)
  async login(
    @Body(body(loginSchema)) input: LoginInput,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    this.assertSameOrigin(req);
    const ip = clientIp(req, this.env.CLIENT_IP_HEADERS, this.env.PROXY_SECRET);
    return this.withCookie(res, await this.auth.login(input, userAgent, ip));
  }

  @Post('demo')
  @HttpCode(200)
  @Throttle(TEN_PER_MINUTE)
  @ApiOperation({ summary: 'Sign in to the shared demo shopper or demo admin account' })
  @ApiContract(demoLoginSchema, authResponseSchema)
  async demo(
    @Body(body(demoLoginSchema)) input: DemoLoginInput,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    this.assertSameOrigin(req);
    return this.withCookie(res, await this.auth.demoLogin(input, userAgent));
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({ summary: 'Exchange the refresh cookie for a new access token (the cookie rotates)' })
  @ApiOkResponse({ schema: openApiSchema(authResponseSchema) })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    this.assertSameOrigin(req);
    try {
      return this.withCookie(res, await this.auth.refresh(this.cookie(req)));
    } catch (error) {
      this.clearCookie(res);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({ summary: 'End this session and clear the refresh cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    this.assertSameOrigin(req);
    await this.auth.logout(this.cookie(req));
    this.clearCookie(res);
  }

  // Native apps keep the session in the platform's secure storage rather than a cookie, so the refresh token
  // travels in the body. These routes never read the cookie: a page script calling them cannot swap the httpOnly cookie for a
  // token it can read. Sign-in checks, rotation and reuse detection are the same AuthService calls as above.

  @Post('native/login')
  @HttpCode(200)
  @Throttle(TEN_PER_MINUTE)
  @ApiOperation({ summary: 'Sign in from a native app; the refresh token is returned in the body' })
  @ApiContract(loginSchema, nativeAuthResponseSchema)
  async nativeLogin(
    @Body(body(loginSchema)) input: LoginInput,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: Request,
  ): Promise<NativeAuthResponse> {
    const ip = clientIp(req, this.env.CLIENT_IP_HEADERS, this.env.PROXY_SECRET);
    return toNative(await this.auth.login(input, userAgent, ip));
  }

  @Post('native/demo')
  @HttpCode(200)
  @Throttle(TEN_PER_MINUTE)
  @ApiOperation({ summary: 'Sign in to a demo account from a native app' })
  @ApiContract(demoLoginSchema, nativeAuthResponseSchema)
  async nativeDemo(
    @Body(body(demoLoginSchema)) input: DemoLoginInput,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<NativeAuthResponse> {
    return toNative(await this.auth.demoLogin(input, userAgent));
  }

  @Post('native/refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange a refresh token for a new pair (the refresh token rotates)' })
  @ApiContract(refreshTokenInputSchema, nativeAuthResponseSchema)
  async nativeRefresh(
    @Body(body(refreshTokenInputSchema)) input: RefreshTokenInput,
  ): Promise<NativeAuthResponse> {
    return toNative(await this.auth.refresh(input.refreshToken));
  }

  @Post('native/logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'End the session a native app holds' })
  @ApiBody({ schema: openApiSchema(refreshTokenInputSchema, 'input') })
  async nativeLogout(@Body(body(refreshTokenInputSchema)) input: RefreshTokenInput): Promise<void> {
    await this.auth.logout(input.refreshToken);
  }

  @Post('forgot-password')
  @HttpCode(202)
  @Throttle(FIVE_PER_MINUTE)
  @ApiOperation({ summary: 'Email a password reset link. Same reply whether or not the account exists.' })
  @ApiContract(emailOnlySchema)
  forgot(@Body(body(emailOnlySchema)) input: { email: string }): Promise<Message> {
    return this.auth.forgotPassword(input.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle(FIVE_PER_MINUTE)
  @ApiOperation({ summary: 'Set a new password with the token from the link; signs out every device' })
  @ApiContract(resetPasswordSchema)
  reset(@Body(body(resetPasswordSchema)) input: ResetPasswordInput): Promise<Message> {
    return this.auth.resetPassword(input);
  }

  private withCookie(res: Response, issued: IssuedSession): AuthResponse {
    const { refreshToken, refreshExpiresAt, ...response } = issued;
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      // the web app and API share one site (Vercel forwards /api), so Strict costs nothing and blocks CSRF
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: refreshExpiresAt,
    });
    return response;
  }

  private clearCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: COOKIE_PATH,
    });
  }

  private cookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' ? value : undefined;
  }

  /** Every route that reads or sets the refresh cookie: a browser request from another site is refused. */
  private assertSameOrigin(req: Request): void {
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== this.env.WEB_ORIGIN)
      throw new ForbiddenException('Cross-site request refused');
  }
}
