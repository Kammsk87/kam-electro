import { Body, Controller, Get, Post, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { CurrentUser } from "./current-user.decorator";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { clearSessionCookie, createSessionCookie } from "./session-cookie";
import { parseBody } from "../common/validation";
import type { AuthUser } from "./auth.types";

const passwordSchema = z.string().min(8).max(128);
const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(2).max(80)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: passwordSchema
});

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("providers")
  getProviders() {
    return this.authService.getProviderManifest();
  }

  @Post("register")
  async register(@Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.authService.register(parseBody(registerSchema, body));
    reply.header("Set-Cookie", createSessionCookie(result.token));
    return result;
  }

  @Post("login")
  async login(@Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.authService.login(parseBody(loginSchema, body));
    reply.header("Set-Cookie", createSessionCookie(result.token));
    return result;
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Set-Cookie", clearSessionCookie());
    return { ok: true };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.getSession(user.id);
  }
}
