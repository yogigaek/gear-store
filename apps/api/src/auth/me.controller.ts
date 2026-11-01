import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  messageSchema,
  updateProfileSchema,
  userSchema,
  type ChangePasswordInput,
  type Message,
  type UpdateProfileInput,
  type User,
} from '@gear-store/shared';
import { openApiSchema } from '../common/openapi.js';
import { FIVE_PER_MINUTE } from '../common/throttle.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AccessTokenGuard, type AuthContext, CurrentAuth } from './access-token.guard.js';
import { AuthService } from './auth.service.js';

@ApiTags('Account')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in account' })
  @ApiOkResponse({ schema: openApiSchema(userSchema) })
  me(@CurrentAuth() auth: AuthContext): Promise<User> {
    return this.auth.profile(auth.userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Change the display name' })
  @ApiBody({ schema: openApiSchema(updateProfileSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(userSchema) })
  update(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateProfileSchema)) input: UpdateProfileInput,
  ): Promise<User> {
    return this.auth.rename(auth.userId, input.name);
  }

  @Post('password')
  @HttpCode(200)
  // a stolen session must not become a way to guess the password: wrong ones also pause the account (AuthService)
  @Throttle(FIVE_PER_MINUTE)
  @ApiOperation({ summary: 'Change the password; other devices are signed out' })
  @ApiBody({ schema: openApiSchema(changePasswordSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(messageSchema) })
  changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(changePasswordSchema)) input: ChangePasswordInput,
  ): Promise<Message> {
    return this.auth.changePassword(auth.userId, auth.sessionId, input);
  }
}
