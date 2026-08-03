import { Module } from "@nestjs/common";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { SocialIntegrationsController } from "./social-integrations.controller";
import { SocialIntegrationsService } from "./social-integrations.service";

@Module({
  imports: [WorkspacesModule],
  controllers: [SocialIntegrationsController],
  providers: [SocialIntegrationsService],
  exports: [SocialIntegrationsService]
})
export class SocialIntegrationsModule {}
