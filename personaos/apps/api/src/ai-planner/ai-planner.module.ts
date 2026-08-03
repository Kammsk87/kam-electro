import { Module } from "@nestjs/common";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { AiPlannerController } from "./ai-planner.controller";
import { AiPlannerService } from "./ai-planner.service";

@Module({
  imports: [WorkspacesModule],
  controllers: [AiPlannerController],
  providers: [AiPlannerService],
  exports: [AiPlannerService]
})
export class AiPlannerModule {}
