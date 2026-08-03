# Next Stage Roadmap

Do not start this roadmap automatically. It is the recommended sequence after the foundation is reviewed.

## Completed: User Foundation

- Email/password authentication.
- Protected routes.
- Workspace, author profile and social account foundation.
- Five-step MLP onboarding.
- Dashboard summary of the author setup.

## Completed: Lovable Capture Loop

- Raw Capture model and REST API.
- Quick Capture for text, photo, voice, video, link and location.
- Autosave and offline queue.
- Capture Inbox with search, favorite, archive and soft delete.
- Today's Captures on Dashboard.

## Completed: Interview Engine

- InterviewSession and InterviewMessage models.
- Template question flow with simple adaptive follow-up.
- Capture detail entry point.
- Interview screen with one active question.
- Pause/resume/complete, edit/delete answers.
- Offline interview draft and answer queue.
- Open Interviews dashboard widget.

## Stage 3: Interview Hardening

- Move large media payloads from JSON/data URL to S3-compatible storage.
- Add background upload progress.
- Add richer mobile recording controls.
- Add end-to-end API tests with a real PostgreSQL service.
- Replace the template question selector with AI orchestration when Stage 10 is approved.

## Stage 2: Memory Primitives

- Add Memory Item, Event, Theme, Person, Place and Project models.
- Add provenance for every captured item.
- Add search and manual linking.
- Add user-controlled privacy boundaries.

## Stage 3: Interview MLP

- Add one-question-at-a-time interview UX.
- Store interview sessions and answers.
- Add “story core” extraction as a human-reviewed step.
- Avoid autonomous content generation until enough context exists.

## Stage 4: Draft Room

- Build the story assembly editor.
- Show source context beside the draft.
- Add version history.
- Add voice-preservation checks.

## Stage 5: Publishing Foundation

- Start with Telegram.
- Add platform-specific draft adaptation.
- Add scheduling and publication status.
- Keep “do not publish yet” as a first-class outcome.

## Stage 6: Analytics That Explains

- Import publication metrics.
- Show insight before numbers.
- Tie performance back to themes, format and author voice.
