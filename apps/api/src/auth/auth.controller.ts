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
  registerSchema,
  resetPasswordSchema,
  tokenOnlySchema,
  type AuthResponse,
  type DemoLoginInput,
  type LoginInput,
  type Message,
  type RegisterInput,
  type ResetPasswordInput,
} from '@gear-store/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { openApiSchema } from '../common/openapi.js';
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
const strict = { default: { limit: 5, ttl: 60_000 } };

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
  @Throttle(strict)
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
  @Throttle(strict)
  @ApiOperation({ summary: 'Send a new confirmation link' })
  @ApiContract(emailOnlySchema)
  resend(@Body(body(emailOnlySchema)) input: { email: string }): Promise<Message> {
    return this.auth.resendVerification(input.email);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(strict)
  @ApiOperation({ summary: 'Sign in; sets the refresh cookie and returns an access token' })
  @ApiContract(loginSchema, authResponseSchema)
  async login(
    @Body(body(loginSchema)) input: LoginInput,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.withCookie(res, await this.auth.login(input, userAgent));
  }

  @Post('demo')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in to the shared demo shopper or demo admin account' })
  @ApiContract(demoLoginSchema, authResponseSchema)
  async demo(
    @Body(body(demoLoginSchema)) input: DemoLoginInput,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
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

  @Post('forgot-password')
  @HttpCode(202)
  @Throttle(strict)
  @ApiOperation({ summary: 'Email a password reset link. Same reply whether or not the account exists.' })
  @ApiContract(emailOnlySchema)
  forgot(@Body(body(emailOnlySchema)) input: { email: string }): Promise<Message> {
    return this.auth.forgotPassword(input.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle(strict)
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

  /** Defence in depth for the two cookie-authenticated routes: a browser request from another site is refused. */
  private assertSameOrigin(req: Request): void {
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== this.env.WEB_ORIGIN)
      throw new ForbiddenException('Cross-site request refused');
  }
}
