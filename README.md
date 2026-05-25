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

- **IndexedDB** is still the automatic local save layer.
- Local edits are auto-saved in the browser after a short debounce.
- **GitHub sync is separate and explicit**: it writes the current snapshot to a GitHub issue only when you click **Sync GitHub**.

## GitHub sync

The app can mirror one project to one GitHub issue:

- the **issue body** stores the canonical shared project snapshot
- **issue comments** are used only as audit/history entries
- each sync writes a new **revision**
- if the remote revision changed, the app blocks overwriting and asks you to **Refresh GitHub** first

### Configure it

From the dashboard or the editor:

1. enter the GitHub **owner**
2. enter the GitHub **repository**
3. paste a GitHub token with permission to read/write issues for that repo
4. optionally change the issue label used for synced projects

The token is stored in **sessionStorage only** so it is cleared when the browser session ends.

### Current workflow

1. Edit normally
2. Let IndexedDB auto-save locally, or click **Salva**
3. Click **Sync GitHub** to push the current snapshot
4. Click **Refresh GitHub** to replace the local project with the remote snapshot

## Notes

- GitHub sync keeps the local IndexedDB model as the source of in-progress edits.
- Remote sync currently ships as an explicit save/refresh flow; batched remote autosave can be layered on later without making GitHub the live edit log.
