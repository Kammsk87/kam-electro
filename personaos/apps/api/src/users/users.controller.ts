import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  getCurrentUser(@CurrentUser() user: AuthUser) {
    return this.usersService.getCurrentUser(user.id);
  }
}
