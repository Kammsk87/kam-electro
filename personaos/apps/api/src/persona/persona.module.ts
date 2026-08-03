import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { PersonaController } from "./persona.controller";
import { PersonaService } from "./persona.service";

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [PersonaController],
  providers: [PersonaService],
  exports: [PersonaService]
})
export class PersonaModule {}
