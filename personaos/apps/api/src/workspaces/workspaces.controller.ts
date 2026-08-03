import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { parseBody } from "../common/validation";
import { WorkspacesService } from "./workspaces.service";

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().nullable()
});

@Controller("workspaces")
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get("active")
  getActive(@CurrentUser() user: AuthUser) {
    return this.workspacesService.getActiveWorkspace(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.workspacesService.createWorkspace(user.id, parseBody(createWorkspaceSchema, body));
  }
}
