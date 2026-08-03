import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { PublicationsController } from "./publications.controller";
import { PublicationsService } from "./publications.service";

@Module({
  imports: [PrismaModule, WorkspacesModule],
  controllers: [PublicationsController],
  providers: [PublicationsService],
  exports: [PublicationsService]
})
export class PublicationsModule {}
