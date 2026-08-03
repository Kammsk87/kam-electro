import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthUser } from "./auth.types";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
  return request.user;
});
