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

## Notes

- The remote adapter stores one seed snapshot in the shared record and appends atomic operation batches in remote comments.
- Refresh reconstructs the current remote project by replaying those comment batches on top of the stored seed snapshot.
