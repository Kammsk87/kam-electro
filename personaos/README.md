# PersonaOS

PersonaOS is an AI operating system for memory-first personal brand development.

This repository is the production foundation for the PersonaOS MLP: **Minimum Lovable Product**. The first release should not merely work. It should feel calm, fast and useful enough that an author wants to open it every day to think, capture and return to meaningful experience.

## Product Principle

PersonaOS is not a post generator.

The product exists to support the full author loop:

```text
Life -> Observation -> Capture -> Reflection -> Story -> Editing -> Publishing -> Analytics -> Author Growth
```

The foundation stage intentionally avoids implementing AI agents, Planner, Memory Engine, social publishing, analytics, interview flows, photo/video processing and content generation. It creates the platform those systems will grow into.

## Stack

- Monorepo: npm workspaces
- Frontend: Next.js, React, TypeScript, Tailwind, shadcn/ui-compatible primitives, React Query, Zustand
- Backend: NestJS, TypeScript
- Database: PostgreSQL, Prisma ORM
- Auth foundation: modern auth boundary, JWT-ready, OAuth-ready data model, Better Auth-compatible integration point
- Storage foundation: S3-compatible MinIO through Docker Compose
- Testing: Vitest, Playwright
- Tooling: ESLint, Prettier, Husky, lint-staged, GitHub Actions

## Structure

```text
personaos/
  apps/
    web/       Next.js product surface
    api/       NestJS API and Prisma schema
    worker/    Background worker entrypoint
  packages/
    ui/        Design tokens and future shared UI exports
    types/     Shared TypeScript contracts
    config/    Typed environment access
    shared/    Cross-package utilities
    ai/        Reserved AI Layer boundary
    prompts/   Reserved prompt/version registry boundary
    memory/    Reserved Memory Engine boundary
    planner/   Reserved Planner Engine boundary
    analytics/ Reserved Analytics boundary
    social/    Reserved social adapters boundary
  docs/        Product and technical decisions
  infra/       Dockerfiles and infrastructure assets
```

## Getting Started

1. Copy environment variables.

```bash
cp .env.example .env
```

2. Start infrastructure.

```bash
docker compose up -d
```

3. Install dependencies.

```bash
npm install
```

4. Generate Prisma client and apply migrations.

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

5. Run apps.

```bash
npm run dev:web
npm run dev:api
npm run dev:worker
```

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm audit --omit=dev
```

## Authentication and Onboarding

Step 8 adds the real user foundation:

- email/password registration;
- login/logout with an httpOnly session cookie;
- protected web routes through Next proxy;
- active workspace creation;
- author profile setup;
- social account settings for Telegram, Instagram, Threads and VK;
- onboarding status API;
- dashboard summary after onboarding.

Stage 9 adds the Lovable Capture Loop:

- quick capture for text, photo, voice, video, link and location;
- autosaved draft on every edit;
- offline queue in local storage;
- manual and online-triggered sync;
- Capture Inbox with search, filters, favorites, archive and soft delete;
- Today's Captures on Dashboard.

Stage 10 adds the Interview Engine:

- start an interview from any Capture;
- one-question-at-a-time template interview flow;
- adaptive follow-up for short answers;
- pause, resume and complete interview sessions;
- editable/deletable user answers;
- offline answer drafts and offline answer queue;
- Open Interviews dashboard widget;
- no LLM, no post generation, no Memory Engine.

Stage 12 adds the Persona DNA foundation:

- editable PersonaProfile for the active workspace;
- PersonaSignal collection with source/type/confidence/weight;
- PersonaVersion snapshots for tracking identity changes over time;
- simple non-AI profile rebuild from weighted signals;
- `/persona` product surface and Dashboard widget;
- no Memory Engine, no Story Engine, no Planner, no publishing and no analytics.

Stage 13 adds the Story Engine foundation:

- completed Reflection can become a Story Draft;
- rule-based Story Builder fills Hook, Context, Conflict, Insight and Takeaway from author answers;
- Story CRUD API;
- `/stories` list and `/story/:id` editor;
- drag-and-drop block order inside the editor;
- Stories Ready / Stories Draft dashboard widget;
- no LLM, no AI writing and no generated posts.

Stage 14 adds the Writing Engine:

- Story can become a platform-specific Draft through the AI abstraction layer;
- providers: OpenAI, Anthropic and Local LLM fallback;
- platform prompts for Telegram, Instagram, Threads and VK;
- Draft CRUD API;
- rewrite modes: Rewrite, Shorter, Longer, More Personal, More Practical, More Sarcastic and Simplify;
- persisted Draft version history;
- `/drafts` list and `/draft/:id` editor with metrics, undo and redo.

Stage 15 adds the Publishing Foundation:

- Draft can become a manual Publication;
- publication statuses: Planned, Ready, Published, Cancelled and Failed;
- scheduling date/time without auto-publishing;
- manual Published marking with external URL and notes;
- `/publishing` list with platform/status filters;
- `/publication/:id` editor;
- Dashboard widget for planned, ready and published-this-week counts;
- no Telegram, Instagram, Threads or VK API integration.

Stage 16 adds Memory Engine Lite:

- Capture automatically creates a MemoryItem;
- completed Reflection enriches the existing memory;
- Story updates the same memory with structured meaning;
- Memory search by title, summary and tags;
- MemoryLink relations: Related, Similar, Followup and Contradiction;
- `/memory` search/list and `/memory/:id` detail;
- Dashboard widget for Memory Items and Recent Memories;
- no AI, no Vector DB and no embeddings.

Stage 17 adds Planner Engine:

- deterministic daily plan without AI;
- daily tasks for Capture, Reflection, Story, Writing and Publishing;
- weekly goals;
- streaks;
- completion history;
- `/planner` product surface and Dashboard widget.

Stage 18 adds Analytics Engine:

- local counts for Captures, Reflections, Stories, Drafts and Publications;
- streak analytics;
- activity heatmap;
- weekly and monthly reports;
- `/analytics` product surface and Dashboard widget;
- no external social APIs.

Stage 19 adds Social Integrations:

- OAuth-ready SocialConnection model for Telegram, Instagram, Threads and VK;
- Integration jobs for publish, schedule, draft sync and status sync;
- adapter boundary for real platform APIs;
- `/integrations` product surface;
- no real platform publishing without credentials.

Stage 20 adds AI Memory:

- MemoryEmbedding model;
- local deterministic embedding provider;
- semantic search;
- similar memories;
- context retrieval;
- `/ai-memory` product surface.

Stage 21 adds AI Planner:

- AI planner recommendations;
- daily task, weekly theme, idea of day and follow-up recommendations;
- recommendation acceptance into PlannerTask;
- deterministic local generation until richer AI orchestration is enabled.

Stage 22 adds AI Research:

- ResearchItem model for trends, competitors, topics and formats;
- Telegram, Instagram, Threads, VK and manual sources;
- local scan from Persona DNA and Memory;
- `/research` product surface.

Stage 23 adds AI Orchestrator:

- AiJob queue;
- priority, attempts, retry, cancel and process-next controls;
- monitoring summary for AI jobs;
- shared future execution boundary for Memory, Planner, Research, Writing and Publishing.

Stage 24 adds Beta Release foundation:

- Feature flags;
- user feedback;
- export jobs;
- beta readiness summary;
- beta release checklist in `docs/beta/beta-release-checklist.md`;
- `/beta` product surface.

Demo seed credentials:

```text
email: alexandr@example.com
password: personaos-demo-2026
```

## API Endpoints

```text
GET  /api/health
GET  /api/auth/providers
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
GET  /api/users/me
GET  /api/workspaces/active
POST /api/workspaces
GET  /api/author-profile
PUT  /api/author-profile
GET  /api/social-accounts
PUT  /api/social-accounts
GET  /api/onboarding/status
POST /api/onboarding/complete
GET  /api/captures
POST /api/captures
GET  /api/captures/:id
PATCH /api/captures/:id
PATCH /api/captures/:id/favorite
PATCH /api/captures/:id/archive
PATCH /api/captures/:id/restore
DELETE /api/captures/:id
GET  /api/interviews?status=open
POST /api/interviews
GET  /api/interviews/:id
PATCH /api/interviews/:id
POST /api/interviews/:id/messages
PATCH /api/interviews/:id/messages/:messageId
DELETE /api/interviews/:id/messages/:messageId
POST /api/interviews/:id/pause
POST /api/interviews/:id/resume
POST /api/interviews/:id/complete
GET  /api/persona
PUT  /api/persona
GET  /api/persona/summary
POST /api/persona/rebuild
GET  /api/persona/signals
POST /api/persona/signals
DELETE /api/persona/signals/:id
GET  /api/persona/versions
POST /api/persona/versions
GET  /api/stories
POST /api/stories
GET  /api/stories/summary
POST /api/stories/from-reflection/:reflectionId
GET  /api/stories/:id
PATCH /api/stories/:id
DELETE /api/stories/:id
GET  /api/drafts
GET  /api/drafts/summary
POST /api/drafts/from-story/:storyId
GET  /api/drafts/:id
PATCH /api/drafts/:id
DELETE /api/drafts/:id
POST /api/drafts/:id/rewrite
GET  /api/publications
GET  /api/publications/summary
POST /api/publications/from-draft/:draftId
GET  /api/publications/:id
PATCH /api/publications/:id
DELETE /api/publications/:id
POST /api/publications/:id/ready
POST /api/publications/:id/published
POST /api/publications/:id/cancel
GET  /api/memory
GET  /api/memory/summary
GET  /api/memory/:id
POST /api/memory/sync
PATCH /api/memory/:id
POST /api/memory/link
DELETE /api/memory/link/:id
GET  /api/planner/today
GET  /api/planner/summary
GET  /api/planner/tasks
POST /api/planner/tasks
PATCH /api/planner/tasks/:id
POST /api/planner/tasks/:id/complete
POST /api/planner/tasks/:id/skip
GET  /api/planner/weekly-goals
POST /api/planner/weekly-goals
PATCH /api/planner/weekly-goals/:id
GET  /api/analytics/summary
GET  /api/analytics/heatmap
GET  /api/analytics/weekly-report
GET  /api/analytics/monthly-report
GET  /api/social-integrations
GET  /api/social-integrations/jobs
POST /api/social-integrations/:platform/connect-url
POST /api/social-integrations/:platform/callback
POST /api/social-integrations/publications/:publicationId/publish
POST /api/social-integrations/publications/:publicationId/sync
GET  /api/ai-memory/summary
POST /api/ai-memory/reindex
GET  /api/ai-memory/search
GET  /api/ai-memory/context
GET  /api/ai-memory/:id/similar
GET  /api/ai-planner/summary
GET  /api/ai-planner/recommendations
POST /api/ai-planner/generate
POST /api/ai-planner/recommendations/:id/accept
GET  /api/research
POST /api/research
POST /api/research/scan
PATCH /api/research/:id
DELETE /api/research/:id
GET  /api/orchestrator/summary
GET  /api/orchestrator/jobs
POST /api/orchestrator/jobs
POST /api/orchestrator/process-next
POST /api/orchestrator/jobs/:id/retry
POST /api/orchestrator/jobs/:id/cancel
GET  /api/beta/readiness
GET  /api/beta/feature-flags
POST /api/beta/feature-flags
GET  /api/beta/feedback
POST /api/beta/feedback
GET  /api/beta/exports
POST /api/beta/exports
POST /api/beta/exports/:id/complete
```

## AI Provider

Writing Engine uses `AI_PROVIDER`.

```text
AI_PROVIDER=local
AI_PROVIDER=openai
AI_PROVIDER=anthropic
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-haiku-latest
```

`local` is the safe development fallback. It does not invent facts; it returns a structured draft from Story data.

## Capture UX Flow

```text
Open PersonaOS -> Capture -> choose source -> write/upload/add location -> autosave draft -> save
```

If the API or network is unavailable, the Capture is stored in a local offline queue and syncs later.

## Interview UX Flow

```text
Open Capture -> Исследовать эту мысль -> one question -> answer -> next question
```

The interview can be paused and resumed later. If offline, answers are stored locally and synced when the network returns.

## Story UX Flow

```text
Complete Reflection -> Перейти к Story Engine -> Story Draft -> edit blocks -> mark Ready
```

The Story Builder does not invent text. It reorganizes the author's Reflection answers into a story structure.

## Writing UX Flow

```text
Open Story -> Create Platform Draft -> AI Writing Engine -> edit -> rewrite/version -> mark Ready
```

Writing Engine receives only Hook, Context, Conflict, Insight and Takeaway. It is not allowed to add facts or new events.

## Publishing UX Flow

```text
Open Draft -> Create Publication -> schedule or mark Ready -> manually publish -> paste external URL -> mark Published
```

PersonaOS does not send anything to social networks in this stage.

## Memory UX Flow

```text
Create Capture -> MemoryItem appears -> complete Reflection -> Memory updates -> create Story -> Memory updates again
```

Memory Lite uses plain database search over title, summary and tags. It does not use embeddings or vector storage.

## Planner UX Flow

```text
Open Planner -> see today's tasks -> complete/skip -> streak updates -> weekly goal progresses
```

Planner Engine is deterministic in Stage 17. It does not use AI recommendations.

## Analytics UX Flow

```text
Use PersonaOS -> local events accumulate -> open Analytics -> review counts, heatmap, weekly and monthly reports
```

Analytics Engine only reads internal PersonaOS data in Stage 18.

## Stage 19-24 UX Flows

```text
Open Integrations -> connect platform -> queue publish/sync job -> inspect status
Open AI Memory -> reindex -> semantic search -> retrieve context
Generate AI Planner recommendations -> accept one -> PlannerTask appears
Open Research -> run local scan -> review topics/formats -> store research items
Queue AI job -> Orchestrator processes/retries/cancels -> monitor summary
Open Beta Center -> review readiness -> submit feedback -> create export job
```

Real social publishing, external trend detection, encrypted token storage and production monitoring require production credentials and deployment configuration.

## MLP Definition

The PersonaOS MLP is not the smallest feature set. It is the smallest coherent experience that makes the user feel:

- “I can capture life before it disappears.”
- “The product helps me think, not just produce content.”
- “The interface is quiet enough to use every day.”
- “My authorship is protected.”
- “This can become my second memory.”

Every future feature should be judged by this standard before scope is accepted.
