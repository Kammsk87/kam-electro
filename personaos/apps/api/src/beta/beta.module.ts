import { Module } from "@nestjs/common";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { BetaController } from "./beta.controller";
import { BetaService } from "./beta.service";

@Module({
  imports: [WorkspacesModule],
  controllers: [BetaController],
  providers: [BetaService],
  exports: [BetaService]
})
export class BetaModule {}
