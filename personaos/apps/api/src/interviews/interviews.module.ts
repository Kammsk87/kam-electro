import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MemoryModule } from "../memory/memory.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { InterviewsController } from "./interviews.controller";
import { InterviewsService } from "./interviews.service";

@Module({
  imports: [AuthModule, WorkspacesModule, MemoryModule],
  controllers: [InterviewsController],
  providers: [InterviewsService],
  exports: [InterviewsService]
})
export class InterviewsModule {}
