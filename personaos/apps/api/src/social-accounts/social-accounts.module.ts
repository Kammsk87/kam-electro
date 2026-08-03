import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { SocialAccountsController } from "./social-accounts.controller";
import { SocialAccountsService } from "./social-accounts.service";

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [SocialAccountsController],
  providers: [SocialAccountsService],
  exports: [SocialAccountsService]
})
export class SocialAccountsModule {}
