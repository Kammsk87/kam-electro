import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { PrismaModule } from "../prisma.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { DraftsController } from "./drafts.controller";
import { DraftsService } from "./drafts.service";

@Module({
  imports: [PrismaModule, WorkspacesModule, AiModule],
  controllers: [DraftsController],
  providers: [DraftsService],
  exports: [DraftsService]
})
export class DraftsModule {}
