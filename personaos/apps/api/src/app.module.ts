import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AiMemoryModule } from "./ai-memory/ai-memory.module";
import { AiPlannerModule } from "./ai-planner/ai-planner.module";
import { AuthModule } from "./auth/auth.module";
import { AuthorProfileModule } from "./author-profile/author-profile.module";
import { BetaModule } from "./beta/beta.module";
import { CapturesModule } from "./captures/captures.module";
import { DraftsModule } from "./drafts/drafts.module";
import { HealthModule } from "./health/health.module";
import { InterviewsModule } from "./interviews/interviews.module";
import { MemoryModule } from "./memory/memory.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { OrchestratorModule } from "./orchestrator/orchestrator.module";
import { PersonaModule } from "./persona/persona.module";
import { PlannerModule } from "./planner/planner.module";
import { PrismaModule } from "./prisma.module";
import { PublicationsModule } from "./publications/publications.module";
import { ResearchModule } from "./research/research.module";
import { SocialAccountsModule } from "./social-accounts/social-accounts.module";
import { SocialIntegrationsModule } from "./social-integrations/social-integrations.module";
import { StoriesModule } from "./stories/stories.module";
import { UsersModule } from "./users/users.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"]
    }),
    PrismaModule,
    HealthModule,
    AnalyticsModule,
    AiMemoryModule,
    AiPlannerModule,
    BetaModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    AuthorProfileModule,
    SocialAccountsModule,
    OnboardingModule,
    OrchestratorModule,
    CapturesModule,
    InterviewsModule,
    MemoryModule,
    PersonaModule,
    PlannerModule,
    StoriesModule,
    DraftsModule,
    PublicationsModule,
    ResearchModule,
    SocialIntegrationsModule
  ]
})
export class AppModule {}
