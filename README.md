# AI Socratic Blog Maker

Browser editor for AI Socratic blog posts built with React, TypeScript, and Vite.

## Local development

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run lint
npm run build
```

## How saving works

- The working copy is auto-saved in the browser after a short debounce.
- Shared storage sync batches local edits and publishes them automatically after a short idle window or when the pending change volume grows.
- Refreshing from shared storage replaces the current local snapshot only after the revision check passes.

## Shared storage workflow

Each project keeps:

- a stable project identifier
- a remote revision
- the last successful remote sync timestamp
- user and source-seed scope metadata for remote filtering
- a seed snapshot plus a queue of pending local operations

Current workflow:

1. Edit normally
2. Let the browser autosave locally, or click **Salva**
3. Let shared storage publish the current batch automatically, or click **Invia ora** to flush it immediately
4. Click **Aggiorna remoto** to replace the local project with the latest reconstructed remote state

## Access

- Remote publishing requires a session credential entered from the dashboard or editor.
- The credential is kept only for the current browser session.
- The UI keeps the concrete backend transparent and only exposes generic shared-storage settings.

## Notes

- The remote adapter stores one seed snapshot in the shared record and appends atomic operation batches in remote comments.
- Refresh reconstructs the current remote project by replaying those comment batches on top of the stored seed snapshot.

## Supabase remote backend

The Supabase implementation keeps:

- the seed snapshot in object storage (`aisocratic-remote-sync`)
- remote project metadata in `public.aisocratic_remote_projects`
- one atomic diff row per queued UI operation in `public.aisocratic_remote_events`

Setup:

1. If you want to initialize the schema manually, open your Supabase SQL editor and run `supabase/remote-sync-schema.sql`
2. Optionally copy `.env.example` to `.env.local` and prefill:
   - `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=<your publishable key>`
3. The app will preload those values locally; anything you type in the shared-storage fields still overrides them for the current browser session

For quick local testing, a service-role key works because it bypasses storage and table policies, but it should stay session-only and never be committed.

If you prefer using the publishable/anon key, add the matching storage and table policies in Supabase first.

## GitHub Pages deployment secrets

The Pages deployment workflow reads two repository secrets at build time and injects them as Vite env variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

To set them:

1. Open **GitHub → this repository → Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Create `VITE_SUPABASE_URL` with the value `https://<your-project-ref>.supabase.co`
4. Create `VITE_SUPABASE_PUBLISHABLE_KEY` with your Supabase publishable key
5. Re-run the **Deploy to GitHub Pages** workflow, or push to `main`

The workflow in `.github/workflows/deploy.yml` already forwards those secrets into `npm run build`, so the deployed app starts with shared storage preconfigured.

## Supabase migration CI/CD

The repository also includes `.github/workflows/supabase-migrations.yml` to validate and apply the schema in `supabase/migrations`.

- On pull requests, it links to the target Supabase project and runs a dry-run migration check
- On pushes to `main` (and manual dispatch), it applies all pending migrations to the linked Supabase project

Required repository secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

The current initial migration is `supabase/migrations/20260526162500_remote_sync_schema.sql`, which creates the storage bucket plus the `aisocratic_remote_projects` and `aisocratic_remote_events` tables for the remote sync backend.
