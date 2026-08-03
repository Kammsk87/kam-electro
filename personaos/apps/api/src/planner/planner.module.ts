import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { PlannerController } from "./planner.controller";
import { PlannerService } from "./planner.service";

@Module({
  imports: [PrismaModule, WorkspacesModule],
  controllers: [PlannerController],
  providers: [PlannerService],
  exports: [PlannerService]
})
export class PlannerModule {}
