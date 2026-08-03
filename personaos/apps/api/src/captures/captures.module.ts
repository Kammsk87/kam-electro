import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MemoryModule } from "../memory/memory.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { CapturesController } from "./captures.controller";
import { CapturesService } from "./captures.service";

@Module({
  imports: [AuthModule, WorkspacesModule, MemoryModule],
  controllers: [CapturesController],
  providers: [CapturesService],
  exports: [CapturesService]
})
export class CapturesModule {}
