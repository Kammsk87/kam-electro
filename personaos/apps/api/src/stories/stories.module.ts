import { Module } from "@nestjs/common";
import { MemoryModule } from "../memory/memory.module";
import { PrismaModule } from "../prisma.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { StoriesController } from "./stories.controller";
import { StoriesService } from "./stories.service";

@Module({
  imports: [PrismaModule, WorkspacesModule, MemoryModule],
  controllers: [StoriesController],
  providers: [StoriesService],
  exports: [StoriesService]
})
export class StoriesModule {}
