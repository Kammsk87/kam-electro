import { Module } from "@nestjs/common";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { ResearchController } from "./research.controller";
import { ResearchService } from "./research.service";

@Module({
  imports: [WorkspacesModule],
  controllers: [ResearchController],
  providers: [ResearchService],
  exports: [ResearchService]
})
export class ResearchModule {}
