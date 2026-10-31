import { Body, Controller, ForbiddenException, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
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
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessTokenGuard, type AuthContext, CurrentAuth } from './access-token.guard.js';
import { AuthService, toUser } from './auth.service.js';
import { publicUserSelect } from './public-user.js';

@ApiTags('Account')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in account' })
  @ApiOkResponse({ schema: openApiSchema(userSchema) })
  async me(@CurrentAuth() auth: AuthContext): Promise<User> {
    return toUser(
      await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: publicUserSelect }),
    );
  }

  @Patch()
  @ApiOperation({ summary: 'Change the display name' })
  @ApiBody({ schema: openApiSchema(updateProfileSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(userSchema) })
  async update(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateProfileSchema)) input: UpdateProfileInput,
  ): Promise<User> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { isDemo: true },
    });
    // demo accounts are shared by every visitor; one visitor must not rename them for the next
    if (user.isDemo) throw new ForbiddenException('Demo accounts cannot change their profile');
    return toUser(
      await this.prisma.user.update({
        where: { id: auth.userId },
        data: { name: input.name },
        select: publicUserSelect,
      }),
    );
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
