import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthController } from './auth.controller.js';
import { ACCESS_TOKEN_TTL_SECONDS, AuthService } from './auth.service.js';
import { MeController } from './me.controller.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL_SECONDS, issuer: 'rakit-api' },
        // pin the algorithm and issuer: "alg: none" or a token minted elsewhere is rejected
        verifyOptions: { algorithms: ['HS256'], issuer: 'rakit-api' },
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [AuthService, AccessTokenGuard],
  exports: [AuthService, AccessTokenGuard, JwtModule],
})
export class AuthModule {}
