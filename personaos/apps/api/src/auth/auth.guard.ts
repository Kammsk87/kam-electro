import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { FastifyRequest } from "fastify";
import { getSessionCookieName, readCookie } from "./session-cookie";
import type { AuthUser } from "./auth.types";

type AuthenticatedRequest = FastifyRequest & {
  user?: AuthUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    const cookieToken = readCookie(request.headers.cookie, getSessionCookieName());
    const token = bearerToken ?? cookieToken;

    if (!token) {
      throw new UnauthorizedException("Session is required.");
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthUser>(token);
      request.user = {
        id: payload.id,
        email: payload.email,
        role: payload.role
      };
      return true;
    } catch {
      throw new UnauthorizedException("Session is invalid or expired.");
    }
  }
}
