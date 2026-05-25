import { canonicalizeSourceUrl, type ProjectDocument, type ProjectSnapshot, type ProjectSyncState } from "./storage";

const SETTINGS_STORAGE_KEY = "aisocratic:github-sync-settings";
const TOKEN_STORAGE_KEY = "aisocratic:github-sync-token";
const MAX_ISSUE_TITLE_LENGTH = 240;

export const DEFAULT_GITHUB_OWNER = "liturrig";
export const DEFAULT_GITHUB_REPO = "ai-aperitivo-blog-maker";
export const DEFAULT_GITHUB_SYNC_LABEL = "aisocratic-project-sync";

type PersistedGitHubSyncSettings = Partial<Pick<GitHubSyncSettings, "owner" | "repo" | "label">>;

type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  updated_at: string;
  pull_request?: unknown;
};

type GitHubSearchResponse = {
  items: GitHubIssue[];
};

type IssueFrontmatter = {
  format: string;
  projectId: string;
  sourceUrl: string;
  revision: string;
  savedAt: number;
  syncedAt: number;
  userId: string;
};

type GitHubRemoteProject = {
  issueNumber: number;
  issueUrl: string;
  snapshot: ProjectSnapshot;
  foundExisting: boolean;
};

export type GitHubSyncSettings = {
  owner: string;
  repo: string;
  token: string;
  label: string;
};

export class GitHubSyncConflictError extends Error {
  readonly remote: GitHubRemoteProject;

  constructor(message: string, remote: GitHubRemoteProject) {
    super(message);
    this.name = "GitHubSyncConflictError";
    this.remote = remote;
  }
}

class GitHubSyncConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubSyncConfigurationError";
  }
}

class GitHubApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

export function loadGitHubSyncSettings(): GitHubSyncSettings {
  let persisted: PersistedGitHubSyncSettings = {};
  let token = "";

  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) persisted = JSON.parse(raw) as PersistedGitHubSyncSettings;
    } catch {
      /* noop */
    }
  }

  if (typeof sessionStorage !== "undefined") {
    try {
      token = sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
    } catch {
      /* noop */
    }
  }

  return {
    owner: typeof persisted.owner === "string" ? persisted.owner.trim() : DEFAULT_GITHUB_OWNER,
    repo: typeof persisted.repo === "string" ? persisted.repo.trim() : DEFAULT_GITHUB_REPO,
    label: typeof persisted.label === "string" && persisted.label.trim() ? persisted.label.trim() : DEFAULT_GITHUB_SYNC_LABEL,
    token: token.trim(),
  };
}

export function saveGitHubSyncSettings(settings: GitHubSyncSettings): GitHubSyncSettings {
  const normalized = normalizeGitHubSyncSettings(settings);

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          owner: normalized.owner,
          repo: normalized.repo,
          label: normalized.label,
        })
      );
    } catch {
      /* noop */
    }
  }

  if (typeof sessionStorage !== "undefined") {
    try {
      if (normalized.token) sessionStorage.setItem(TOKEN_STORAGE_KEY, normalized.token);
      else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* noop */
    }
  }

  return normalized;
}

export function isGitHubSyncConfigured(settings: GitHubSyncSettings): boolean {
  return Boolean(settings.owner && settings.repo && settings.token);
}

export function buildGitHubIssueUrl(settings: Pick<GitHubSyncSettings, "owner" | "repo">, remoteId?: string | null): string | null {
  if (!settings.owner || !settings.repo || !remoteId) return null;
  return `https://github.com/${settings.owner}/${settings.repo}/issues/${remoteId}`;
}

export async function syncProjectToGitHub(
  settings: GitHubSyncSettings,
  userId: string,
  snapshot: ProjectSnapshot
): Promise<GitHubRemoteProject> {
  const normalizedSettings = requireGitHubSyncSettings(settings);
  await ensureSyncLabelExists(normalizedSettings);

  const localProject = snapshot.project;
  const existingIssue = await resolveProjectIssue(normalizedSettings, localProject.id, snapshot.syncState?.remoteId ?? null);
  const parsedRemote = existingIssue ? parseRemoteIssue(existingIssue) : null;

  if (existingIssue && parsedRemote && parsedRemote.frontmatter.revision !== (snapshot.syncState?.revision ?? null)) {
    throw new GitHubSyncConflictError(
      "La revisione remota su GitHub è cambiata. Aggiorna il progetto da GitHub prima di sincronizzare di nuovo.",
      toRemoteProject(existingIssue, parsedRemote.project, parsedRemote.frontmatter, true)
    );
  }

  const syncedAt = Date.now();
  const revision = createRevision();
  const projectForRemote = toRemoteProjectDocument(localProject);
  const issueBody = serializeIssueBody(projectForRemote, {
    format: "aisocratic-github-sync-v1",
    projectId: localProject.id,
    sourceUrl: canonicalizeSourceUrl(localProject.sourceUrl),
    revision,
    savedAt: localProject.savedAt,
    syncedAt,
    userId,
  });

  const issue = existingIssue
    ? await requestGitHub<GitHubIssue>(normalizedSettings, issuePath(normalizedSettings, existingIssue.number), {
        method: "PATCH",
        body: JSON.stringify({
          title: buildIssueTitle(localProject),
          body: issueBody,
        }),
      })
    : await requestGitHub<GitHubIssue>(normalizedSettings, repoPath(normalizedSettings, "/issues"), {
        method: "POST",
        body: JSON.stringify({
          title: buildIssueTitle(localProject),
          body: issueBody,
          labels: [normalizedSettings.label],
        }),
      });

  await createAuditComment(normalizedSettings, issue.number, localProject, revision, userId, Boolean(existingIssue));

  const syncState: ProjectSyncState = {
    remoteId: String(issue.number),
    revision,
    lastSyncedAt: syncedAt,
  };

  return {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    foundExisting: Boolean(existingIssue),
    snapshot: {
      project: localProject,
      syncState,
    },
  };
}

export async function refreshProjectFromGitHub(
  settings: GitHubSyncSettings,
  projectId: string,
  remoteId?: string | null
): Promise<GitHubRemoteProject> {
  const normalizedSettings = requireGitHubSyncSettings(settings);
  const issue = await resolveProjectIssue(normalizedSettings, projectId, remoteId ?? null);
  if (!issue) {
    throw new Error("Nessun issue GitHub trovato per questo progetto.");
  }

  const parsedRemote = parseRemoteIssue(issue);
  if (parsedRemote.frontmatter.projectId !== projectId) {
    throw new Error("L'issue GitHub configurato appartiene a un progetto diverso.");
  }

  return toRemoteProject(issue, parsedRemote.project, parsedRemote.frontmatter, true);
}

function normalizeGitHubSyncSettings(settings: GitHubSyncSettings): GitHubSyncSettings {
  return {
    owner: settings.owner.trim(),
    repo: settings.repo.trim(),
    token: settings.token.trim(),
    label: settings.label.trim() || DEFAULT_GITHUB_SYNC_LABEL,
  };
}

function requireGitHubSyncSettings(settings: GitHubSyncSettings): GitHubSyncSettings {
  const normalized = normalizeGitHubSyncSettings(settings);
  if (!normalized.owner || !normalized.repo || !normalized.token) {
    throw new GitHubSyncConfigurationError("Configura owner, repository e token GitHub prima di usare la sincronizzazione remota.");
  }
  return normalized;
}

async function ensureSyncLabelExists(settings: GitHubSyncSettings): Promise<void> {
  try {
    await requestGitHub(settings, repoPath(settings, `/labels/${encodeURIComponent(settings.label)}`));
  } catch (error) {
    if (!(error instanceof GitHubApiError)) {
      throw new Error(`Impossibile verificare la label GitHub "${settings.label}".`, { cause: error });
    }
    if (error.status !== 404) {
      throw new Error(`Impossibile verificare la label GitHub "${settings.label}": ${error.message}`, {
        cause: error,
      });
    }
    try {
      await requestGitHub(settings, repoPath(settings, "/labels"), {
        method: "POST",
        body: JSON.stringify({
          name: settings.label,
          color: "7c5cff",
          description: "Canonical AI Socratic project snapshots",
        }),
      });
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : String(createError);
      throw new Error(`Impossibile creare la label GitHub "${settings.label}": ${message}`, {
        cause: createError,
      });
    }
  }
}

async function resolveProjectIssue(
  settings: GitHubSyncSettings,
  projectId: string,
  remoteId: string | null
): Promise<GitHubIssue | null> {
  if (remoteId) {
    const direct = await loadIssueByRemoteId(settings, remoteId);
    if (direct) return direct;
  }
  return findIssueByProjectId(settings, projectId);
}

async function loadIssueByRemoteId(settings: GitHubSyncSettings, remoteId: string): Promise<GitHubIssue | null> {
  const issueNumber = Number(remoteId);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) return null;
  try {
    const issue = await requestGitHub<GitHubIssue>(settings, issuePath(settings, issueNumber));
    return issue.pull_request ? null : issue;
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  }
}

async function findIssueByProjectId(settings: GitHubSyncSettings, projectId: string): Promise<GitHubIssue | null> {
  const query = encodeURIComponent(
    `repo:${settings.owner}/${settings.repo} is:issue label:"${settings.label}" in:title "[aisocratic:${projectId}]"`
  );
  const response = await requestGitHub<GitHubSearchResponse>(settings, `/search/issues?q=${query}&per_page=10`);
  for (const item of response.items) {
    if (item.pull_request) continue;
    try {
      const parsed = parseRemoteIssue(item);
      if (parsed.frontmatter.projectId === projectId) return item;
    } catch {
      /* skip malformed issue bodies */
    }
  }
  return null;
}

async function createAuditComment(
  settings: GitHubSyncSettings,
  issueNumber: number,
  project: ProjectDocument,
  revision: string,
  userId: string,
  updated: boolean
): Promise<void> {
  await requestGitHub(settings, issuePath(settings, issueNumber, "/comments"), {
    method: "POST",
    body: JSON.stringify({
      body: [
        updated ? "🔄 Project snapshot updated." : "🆕 Project snapshot created.",
        "",
        `- Revision: \`${revision}\``,
        `- Project: ${escapeMarkdownText(project.title || project.sourceUrl)}`,
        `- Source: ${escapeMarkdownText(project.sourceUrl)}`,
        `- Saved locally at: ${new Date(project.savedAt).toISOString()}`,
        `- Synced by: ${escapeMarkdownText(userId)}`,
      ].join("\n"),
    }),
  });
}

async function requestGitHub<T>(
  settings: GitHubSyncSettings,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${settings.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `GitHub API error (${response.status})`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      /* noop */
    }
    throw new GitHubApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function parseRemoteIssue(issue: GitHubIssue): { frontmatter: IssueFrontmatter; project: ProjectDocument } {
  const body = issue.body ?? "";
  const match = body.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Il body dell'issue GitHub non contiene frontmatter valido.");
  }

  const frontmatter = parseFrontmatter(match[1]);
  if (
    frontmatter.format !== "aisocratic-github-sync-v1" ||
    typeof frontmatter.projectId !== "string" ||
    typeof frontmatter.sourceUrl !== "string" ||
    typeof frontmatter.revision !== "string" ||
    typeof frontmatter.savedAt !== "number" ||
    typeof frontmatter.syncedAt !== "number" ||
    typeof frontmatter.userId !== "string"
  ) {
    throw new Error("Il frontmatter dell'issue GitHub non è valido.");
  }

  const jsonMatch = match[2].match(/```json\n([\s\S]*?)\n```/);
  if (!jsonMatch) {
    throw new Error("Il body dell'issue GitHub non contiene uno snapshot JSON valido.");
  }

  const parsed = JSON.parse(jsonMatch[1]) as unknown;
  return {
    frontmatter,
    project: toLocalProjectDocument(parsed, frontmatter),
  };
}

function parseFrontmatter(frontmatterBlock: string): IssueFrontmatter {
  const out: Record<string, unknown> = {};
  for (const line of frontmatterBlock.split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    try {
      out[key] = JSON.parse(rawValue);
    } catch {
      out[key] = rawValue;
    }
  }
  return out as IssueFrontmatter;
}

function serializeIssueBody(project: ProjectDocument, frontmatter: IssueFrontmatter): string {
  return `---
${serializeFrontmatter(frontmatter)}---
# AI Socratic project sync

This issue stores the canonical shared snapshot for one browser project.

- Project title: ${project.title || project.sourceUrl}
- Source URL: ${project.sourceUrl}
- Revision: \`${frontmatter.revision}\`
- Last sync: ${new Date(frontmatter.syncedAt).toISOString()}

## Snapshot JSON

\`\`\`json
${JSON.stringify(project, null, 2)}
\`\`\`
`;
}

function serializeFrontmatter(frontmatter: IssueFrontmatter): string {
  return Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n")
    .concat("\n");
}

function toRemoteProjectDocument(project: ProjectDocument): ProjectDocument {
  return {
    ...project,
    sourceUrl: canonicalizeSourceUrl(project.sourceUrl),
    model: {
      ...project.model,
      baseHref: canonicalizeSourceUrl(project.model.baseHref || project.sourceUrl),
      originalHTML: "",
    },
  };
}

function toLocalProjectDocument(value: unknown, frontmatter: IssueFrontmatter): ProjectDocument {
  if (!value || typeof value !== "object") {
    throw new Error("Lo snapshot GitHub non contiene un progetto valido.");
  }

  const candidate = value as Partial<ProjectDocument> & {
    model?: Partial<ProjectDocument["model"]>;
  };

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.createdAt !== "number" ||
    typeof candidate.savedAt !== "number" ||
    !candidate.model ||
    !Array.isArray(candidate.model.macros)
  ) {
    throw new Error("Lo snapshot GitHub è incompleto.");
  }

  return {
    id: candidate.id,
    sourceUrl: canonicalizeSourceUrl(
      typeof candidate.sourceUrl === "string" ? candidate.sourceUrl : frontmatter.sourceUrl
    ),
    title: candidate.title,
    createdAt: candidate.createdAt,
    savedAt: candidate.savedAt,
    model: {
      preHTML: typeof candidate.model.preHTML === "string" ? candidate.model.preHTML : "",
      macros: candidate.model.macros as ProjectDocument["model"]["macros"],
      baseHref: canonicalizeSourceUrl(
        typeof candidate.model.baseHref === "string" ? candidate.model.baseHref : frontmatter.sourceUrl
      ),
      originalHTML: typeof candidate.model.originalHTML === "string" ? candidate.model.originalHTML : "",
      header: {
        title:
          typeof candidate.model.header?.title === "string" ? candidate.model.header.title : candidate.title,
        meta: typeof candidate.model.header?.meta === "string" ? candidate.model.header.meta : "",
        heroImg: typeof candidate.model.header?.heroImg === "string" ? candidate.model.header.heroImg : "",
      },
    },
  };
}

function toRemoteProject(
  issue: GitHubIssue,
  project: ProjectDocument,
  frontmatter: IssueFrontmatter,
  foundExisting: boolean
): GitHubRemoteProject {
  return {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    foundExisting,
    snapshot: {
      project,
      syncState: {
        remoteId: String(issue.number),
        revision: frontmatter.revision,
        lastSyncedAt: frontmatter.syncedAt,
      },
    },
  };
}

function buildIssueTitle(project: ProjectDocument): string {
  const title = project.title || project.sourceUrl || "Untitled project";
  return truncateForIssueTitle(`[aisocratic:${project.id}] ${title}`, MAX_ISSUE_TITLE_LENGTH);
}

function createRevision(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rev_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function repoPath(settings: Pick<GitHubSyncSettings, "owner" | "repo">, suffix = ""): string {
  return `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}${suffix}`;
}

function issuePath(settings: Pick<GitHubSyncSettings, "owner" | "repo">, issueNumber: number, suffix = ""): string {
  return `${repoPath(settings, "/issues")}/${issueNumber}${suffix}`;
}

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

function truncateForIssueTitle(value: string, maxLength: number): string {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segments = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value));
    return segments.slice(0, maxLength).map((item) => item.segment).join("");
  }
  return Array.from(value)
    .slice(0, maxLength)
    .join("");
}
