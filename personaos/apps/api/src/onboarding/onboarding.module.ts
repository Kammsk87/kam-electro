import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [OnboardingController],
  providers: [OnboardingService]
})
export class OnboardingModule {}
