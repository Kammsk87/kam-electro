import { Module } from "@nestjs/common";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { OrchestratorController } from "./orchestrator.controller";
import { OrchestratorService } from "./orchestrator.service";

@Module({
  imports: [WorkspacesModule],
  controllers: [OrchestratorController],
  providers: [OrchestratorService],
  exports: [OrchestratorService]
})
export class OrchestratorModule {}
