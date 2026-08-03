import { Module } from "@nestjs/common";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { AiMemoryController } from "./ai-memory.controller";
import { AiMemoryService } from "./ai-memory.service";

@Module({
  imports: [WorkspacesModule],
  controllers: [AiMemoryController],
  providers: [AiMemoryService],
  exports: [AiMemoryService]
})
export class AiMemoryModule {}
