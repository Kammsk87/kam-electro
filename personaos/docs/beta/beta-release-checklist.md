# PersonaOS Beta Release Checklist

Stage 24 turns PersonaOS from a working product into a beta-ready product. This checklist is the release gate before a closed beta.

## Observability

- API emits structured runtime logs.
- Orchestrator exposes queued, running, succeeded, failed and cancelled AI jobs.
- Social integration jobs preserve payload, result, attempts and error messages.
- Failed publish/sync jobs never mark a publication as published automatically.

## Backups

- Production PostgreSQL must run with automated daily backups.
- Backup restore must be tested before inviting external beta users.
- Export jobs must stay independent from backup jobs; exports are user portability, backups are disaster recovery.

## Feature Flags

- Risky beta behavior must ship behind `FeatureFlag`.
- Workspace-scoped flags are the default.
- Global flags should only be introduced with an explicit migration and operational owner.

## Privacy

- Persona DNA, Memory, Captures and Reflection data are sensitive by default.
- Export and deletion flows must be visible before public beta.
- External social tokens must be encrypted before real OAuth credentials are enabled.
- Logs must never include raw tokens, passwords or full private reflections.

## Security Audit

- Verify auth guards on every new route.
- Verify workspace ownership checks on every read/write.
- Verify social callbacks cannot connect accounts to another workspace.
- Verify publish jobs cannot send drafts from inaccessible workspaces.

## Performance Audit

- AI Memory local similarity is acceptable for beta-sized workspaces.
- Before large imports, move semantic search to pgvector or a managed vector index.
- Dashboard must avoid loading heavyweight analytics or research scans eagerly.

## Release Pipeline

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run prisma:deploy --workspace @personaos/api`
- Seed only non-production environments.

## Release Rule

No new product features after Stage 24 until code review, architecture review, security review and performance review are complete.
