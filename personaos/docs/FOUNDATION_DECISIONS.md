# Foundation Decisions

## 1. MLP, Not MVP

PersonaOS will be built as a Minimum Lovable Product. The first usable version must feel desirable, not merely functional. The foundation therefore prioritizes:

- fast capture surfaces;
- calm navigation;
- design tokens from day one;
- clear package boundaries;
- production tooling;
- space for Memory, AI and Planner without premature domain shortcuts.

## 2. Monorepo

The repository uses npm workspaces because npm is already available in the local environment and is CI-friendly. The structure keeps applications and domain packages separate without introducing unnecessary build-system complexity on day one.

## 3. Modular First, Service-Ready Later

`apps/api` starts as a NestJS application with modules. Domain packages under `packages/` create future extraction points for AI, Memory, Planner, Analytics and Social integrations.

## 4. Memory and AI Are Reserved, Not Implemented

The user explicitly asked not to build AI, Planner, publishing, analytics, memory, interview, photo or video behavior at this stage. Packages exist only as boundaries so the next phase can implement them without reshaping the repo.

## 5. Auth Foundation

The data model supports users, accounts, sessions and workspaces. The API exposes an auth provider manifest and is JWT/OAuth-ready with a Better Auth-compatible integration point, but complete sign-in behavior is intentionally deferred. The Better Auth runtime package is not installed in this foundation because the currently resolved dependency tree introduced production audit issues through a vulnerable transitive Next.js dependency.

## 6. Database Foundation

Prisma owns the operational schema. The first migration covers identity and workspace only because those are platform primitives required before all future domains.

## 7. Design Tokens

Tokens are defined in CSS variables and `@personaos/ui`. The visual direction is restrained and calm: no loud gradients, no decorative surfaces, no “growth-hack” energy.

## 8. CI-Ready Tooling

The repository includes linting, formatting, tests, Playwright, Prisma generation and GitHub Actions from the beginning so quality does not become a cleanup task later.
