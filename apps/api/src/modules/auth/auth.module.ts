import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ENV, type Env } from "../../config/env.schema";
import { MailModule } from "../mail/mail.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { PasswordResetService } from "./password-reset.service";

@Global()
@Module({
  imports: [
    MailModule,
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: { issuer: "rt-finance" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, PasswordResetService],
  exports: [AuthService, TokenService, JwtModule],
})
export class AuthModule {}
