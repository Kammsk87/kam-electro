import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { MemoryController } from "./memory.controller";
import { MemoryService } from "./memory.service";

@Module({
  imports: [PrismaModule, WorkspacesModule],
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService]
})
export class MemoryModule {}
