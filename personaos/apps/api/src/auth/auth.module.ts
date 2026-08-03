import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthGuard } from "./auth.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET") ?? "development-only-secret-change-me",
        signOptions: {
          expiresIn: "15m"
        }
      })
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard, JwtModule]
})
export class AuthModule {}
