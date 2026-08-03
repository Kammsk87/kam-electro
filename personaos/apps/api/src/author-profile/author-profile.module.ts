import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { AuthorProfileController } from "./author-profile.controller";
import { AuthorProfileService } from "./author-profile.service";

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [AuthorProfileController],
  providers: [AuthorProfileService],
  exports: [AuthorProfileService]
})
export class AuthorProfileModule {}
