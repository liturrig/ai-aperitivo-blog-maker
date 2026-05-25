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
- Publishing to shared storage is a separate, explicit action.
- Refreshing from shared storage replaces the current local snapshot only after the revision check passes.

## Shared storage workflow

Each project keeps:

- a stable project identifier
- a remote revision
- the last successful remote sync timestamp
- user and source-seed scope metadata for remote filtering

Current workflow:

1. Edit normally
2. Let the browser autosave locally, or click **Salva**
3. Click **Pubblica** to push the current snapshot to shared storage
4. Click **Aggiorna remoto** to replace the local project with the latest published snapshot

## Access

- Remote publishing requires an access key entered from the dashboard or editor.
- The access key is kept only for the current browser session.

## Notes

- The current remote flow is still explicit publish/refresh.
- Batched remote autosave is not enabled in this version.
