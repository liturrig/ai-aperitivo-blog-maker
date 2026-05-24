import type { BlogModel } from "./parser";

const DB_NAME = "aisocratic-blog-maker";
const DB_VERSION = 1;
const PROJECTS_STORE = "projects";
const PROJECTS_BY_USER_INDEX = "by-userId";
const SOURCES_STORE = "source-cache";

const LEGACY_PROJECT_PREFIX = "aperitivo:project:";
// v3 wraps the exported payload as `{ project, syncState }` so the shared project
// document stays persistence-agnostic while repository-specific sync state travels separately.
const FILE_FORMAT = "aisocratic-project-v3";

export type ProjectDocument = {
  id: string;
  sourceUrl: string;
  title: string;
  createdAt: number;
  savedAt: number;
  model: BlogModel;
};

export type ProjectSyncState = {
  remoteId: string | null;
  revision: string | null;
};

export type ProjectSnapshot = {
  project: ProjectDocument;
  syncState?: ProjectSyncState | null;
};

export type CachedSource = {
  sourceUrl: string;
  html: string;
  model: BlogModel;
  fetchedAt: number;
};

export interface ProjectRepository {
  listProjects(userId: string): Promise<ProjectDocument[]>;
  loadProject(userId: string, id: string): Promise<ProjectDocument | null>;
  loadProjectSnapshot(userId: string, id: string): Promise<ProjectSnapshot | null>;
  saveProject(userId: string, project: ProjectDocument, syncState?: ProjectSyncState | null): Promise<boolean>;
  saveProjectSnapshot(userId: string, snapshot: ProjectSnapshot): Promise<boolean>;
  deleteProject(userId: string, id: string): Promise<void>;
  importProjectFromFile(file: File, userId: string): Promise<ProjectSnapshot>;
  exportProjectToFile(snapshot: ProjectSnapshot): void;
}

export interface SourceCacheRepository {
  loadCachedSource(url: string): Promise<CachedSource | null>;
  saveCachedSource(source: CachedSource): Promise<boolean>;
}

type LegacyProjectShape = Partial<ProjectDocument> &
  Partial<{
    url: string;
    sourceUrl: string;
    remoteIssueNumber: number | null;
    remoteRevision: string | null;
    sync: ProjectSyncState | null;
    project: ProjectDocument;
    syncState: ProjectSyncState | null;
  }> & {
    model?: BlogModel;
    savedAt?: number;
  };

type StoredProjectRecord = {
  id: string;
  userId: string;
  project: ProjectDocument;
  syncState?: ProjectSyncState | null;
};

let dbPromise: Promise<IDBDatabase> | null = null;

export const projectRepository: ProjectRepository = {
  async listProjects(userId) {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) return [];

    await migrateLegacyLocalStorageProjects(normalizedUserId);

    try {
      const db = await openDatabase();
      const tx = db.transaction(PROJECTS_STORE, "readonly");
      const raw = await requestAsPromise<unknown[]>(
        tx.objectStore(PROJECTS_STORE).index(PROJECTS_BY_USER_INDEX).getAll(normalizedUserId)
      );
      await waitForTransaction(tx);
      return raw
        .map((value) => toStoredProjectRecord(value))
        .filter((record): record is StoredProjectRecord => record !== null)
        .map((record) => record.project)
        .sort((a, b) => b.savedAt - a.savedAt);
    } catch {
      return [];
    }
  },

  async loadProject(userId, id) {
    const snapshot = await this.loadProjectSnapshot(userId, id);
    return snapshot?.project ?? null;
  },

  async loadProjectSnapshot(userId, id) {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) return null;

    try {
      const db = await openDatabase();
      const tx = db.transaction(PROJECTS_STORE, "readonly");
      const raw = await requestAsPromise<unknown>(tx.objectStore(PROJECTS_STORE).get(id));
      await waitForTransaction(tx);
      const record = toStoredProjectRecord(raw);
      if (!record || record.userId !== normalizedUserId) return null;
      return { project: record.project, syncState: record.syncState ?? null };
    } catch {
      return null;
    }
  },

  async saveProject(userId, project, syncState) {
    return this.saveProjectSnapshot(userId, { project, syncState });
  },

  async saveProjectSnapshot(userId, snapshot) {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) return false;

    try {
      const db = await openDatabase();
      const tx = db.transaction(PROJECTS_STORE, "readwrite");
      tx.objectStore(PROJECTS_STORE).put(
        toStoredProjectRecordValue(normalizedUserId, snapshot.project, snapshot.syncState)
      );
      await waitForTransaction(tx);
      return true;
    } catch {
      return false;
    }
  },

  async deleteProject(userId, id) {
    const existing = await this.loadProjectSnapshot(userId, id);
    if (!existing) return;

    try {
      const db = await openDatabase();
      const tx = db.transaction(PROJECTS_STORE, "readwrite");
      tx.objectStore(PROJECTS_STORE).delete(id);
      await waitForTransaction(tx);
    } catch {
      /* noop */
    }
  },

  async importProjectFromFile(file, userId) {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("File non è JSON valido.");
    }

    const snapshot = parseImportedProject(parsed, file.name);
    const project: ProjectDocument = {
      ...snapshot.project,
      id: newProjectId(),
      savedAt: Date.now(),
    };
    const normalizedSnapshot = { project: normalizeProject(project), syncState: normalizeSyncState(snapshot.syncState) };

    if (!(await this.saveProjectSnapshot(userId, normalizedSnapshot))) {
      throw new Error("Impossibile salvare nel database del browser (IndexedDB).");
    }

    return normalizedSnapshot;
  },

  exportProjectToFile(snapshot) {
    const payload = {
      _format: FILE_FORMAT,
      project: normalizeProject(snapshot.project),
      syncState: normalizeSyncState(snapshot.syncState),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aisocratic-${slugify(snapshot.project.title)}-${ymd(snapshot.project.savedAt)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export const sourceCacheRepository: SourceCacheRepository = {
  async loadCachedSource(url) {
    const sourceUrl = canonicalizeSourceUrl(url);
    if (!sourceUrl) return null;

    try {
      const db = await openDatabase();
      const tx = db.transaction(SOURCES_STORE, "readonly");
      const raw = await requestAsPromise<unknown>(tx.objectStore(SOURCES_STORE).get(sourceUrl));
      await waitForTransaction(tx);
      return isCachedSource(raw) ? { ...raw, sourceUrl } : null;
    } catch {
      return null;
    }
  },

  async saveCachedSource(source) {
    const normalized: CachedSource = {
      ...source,
      sourceUrl: canonicalizeSourceUrl(source.sourceUrl),
    };
    if (!normalized.sourceUrl) return false;

    try {
      const db = await openDatabase();
      const tx = db.transaction(SOURCES_STORE, "readwrite");
      tx.objectStore(SOURCES_STORE).put(normalized);
      await waitForTransaction(tx);
      return true;
    } catch {
      return false;
    }
  },
};

export function newProjectId(): string {
  return "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function normalizeUserId(userId: string): string {
  return userId.trim().toLowerCase();
}

export function canonicalizeSourceUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }
    return parsed.href;
  } catch {
    return trimmed;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          const projects = db.createObjectStore(PROJECTS_STORE, { keyPath: "id" });
          projects.createIndex(PROJECTS_BY_USER_INDEX, "userId", { unique: false });
        }

        if (!db.objectStoreNames.contains(SOURCES_STORE)) {
          db.createObjectStore(SOURCES_STORE, { keyPath: "sourceUrl" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Impossibile aprire IndexedDB."));
    });
  }

  return dbPromise;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Richiesta IndexedDB fallita."));
  });
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Transazione IndexedDB annullata."));
    tx.onerror = () => reject(tx.error ?? new Error("Transazione IndexedDB fallita."));
  });
}

function normalizeProject(project: ProjectDocument): ProjectDocument {
  const sourceUrl = resolveProjectSourceUrl(project);
  return {
    ...project,
    sourceUrl,
    title: project.title || project.model.header?.title || sourceUrl,
  };
}

function resolveProjectSourceUrl(project: {
  sourceUrl?: string;
  url?: string;
  model: Pick<BlogModel, "baseHref">;
}): string {
  return canonicalizeSourceUrl(project.sourceUrl || project.url || project.model.baseHref || "");
}

function normalizeSyncState(syncState?: ProjectSyncState | null): ProjectSyncState | null {
  if (!syncState) return null;
  return {
    remoteId: typeof syncState.remoteId === "string" ? syncState.remoteId : null,
    revision: typeof syncState.revision === "string" ? syncState.revision : null,
  };
}

function toStoredProjectRecordValue(
  userId: string,
  project: ProjectDocument,
  syncState?: ProjectSyncState | null
): StoredProjectRecord {
  const normalizedProject = normalizeProject(project);
  return {
    id: normalizedProject.id,
    userId,
    project: normalizedProject,
    syncState: normalizeSyncState(syncState),
  };
}

function toStoredProjectRecord(value: unknown): StoredProjectRecord | null {
  if (!value || typeof value !== "object") return null;

  if ("project" in value && "userId" in value) {
    const candidate = value as {
      id?: unknown;
      userId?: unknown;
      project?: unknown;
      syncState?: unknown;
    };
    if (typeof candidate.userId !== "string" || !isProjectDocument(candidate.project)) return null;
    return {
      id: candidate.project.id,
      userId: normalizeUserId(candidate.userId),
      project: normalizeProject(candidate.project),
      syncState: normalizeSyncState(candidate.syncState as ProjectSyncState | null | undefined),
    };
  }

  if ("model" in value && "userId" in value) {
    const legacy = value as LegacyProjectShape & { id?: unknown; userId?: unknown };
    if (typeof legacy.userId !== "string" || !legacy.model || !Array.isArray(legacy.model.macros)) return null;
    const resolvedSourceUrl = resolveProjectSourceUrl({
      sourceUrl: legacy.sourceUrl,
      url: legacy.url,
      model: legacy.model,
    });
    const project = normalizeProject({
      id: typeof legacy.id === "string" ? legacy.id : newProjectId(),
      sourceUrl: resolvedSourceUrl,
      title: legacy.title || legacy.model.header?.title || resolvedSourceUrl,
      createdAt: typeof legacy.createdAt === "number" ? legacy.createdAt : Date.now(),
      savedAt: typeof legacy.savedAt === "number" ? legacy.savedAt : Date.now(),
      model: legacy.model,
    });
    return {
      id: project.id,
      userId: normalizeUserId(legacy.userId),
      project,
      syncState: normalizeSyncState({
        // Legacy exports persisted a numeric GitHub issue number; the repository now
        // exposes a provider-agnostic string remoteId so other backends can reuse it.
        remoteId:
          typeof legacy.remoteIssueNumber === "number" ? String(legacy.remoteIssueNumber) : null,
        revision: typeof legacy.remoteRevision === "string" ? legacy.remoteRevision : null,
      }),
    };
  }

  return null;
}

function parseImportedProject(parsed: unknown, fileName: string): ProjectSnapshot {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("File non riconosciuto: formato progetto mancante.");
  }

  const candidate = parsed as LegacyProjectShape;
  const importedProject = isProjectDocument(candidate.project) ? candidate.project : extractLegacyProject(candidate, fileName);
  const normalizedProject = normalizeProject({
    ...importedProject,
    id: importedProject.id || newProjectId(),
  });

  return {
    project: normalizedProject,
    syncState: normalizeSyncState(
      candidate.syncState ||
        candidate.sync || {
          // Legacy exports persisted a numeric GitHub issue number; the repository now
          // exposes a provider-agnostic string remoteId so other backends can reuse it.
          remoteId:
            typeof candidate.remoteIssueNumber === "number" ? String(candidate.remoteIssueNumber) : null,
          revision: typeof candidate.remoteRevision === "string" ? candidate.remoteRevision : null,
        }
    ),
  };
}

function extractLegacyProject(candidate: LegacyProjectShape, fileName: string): ProjectDocument {
  const model = candidate.model;
  if (!model || !Array.isArray(model.macros)) {
    throw new Error("File non valido: 'model.macros' assente o non un array.");
  }

  const now = Date.now();
  const sourceUrl = resolveProjectSourceUrl({
    sourceUrl: candidate.sourceUrl,
    url: candidate.url,
    model,
  });
  return {
    id: typeof candidate.id === "string" ? candidate.id : newProjectId(),
    sourceUrl,
    title: candidate.title || model.header?.title || fileName.replace(/\.json$/i, ""),
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : now,
    savedAt: typeof candidate.savedAt === "number" ? candidate.savedAt : now,
    model,
  };
}

function isProjectDocument(value: unknown): value is ProjectDocument {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    "model" in value &&
    "sourceUrl" in value
  );
}

function isCachedSource(value: unknown): value is CachedSource {
  return !!value && typeof value === "object" && "sourceUrl" in value && "model" in value && "html" in value;
}

async function migrateLegacyLocalStorageProjects(userId: string): Promise<void> {
  if (typeof localStorage === "undefined") return;

  const entries: Array<{ key: string; snapshot: ProjectSnapshot }> = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LEGACY_PROJECT_PREFIX)) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw) as LegacyProjectShape;
        const snapshot = parseImportedProject(parsed, key.slice(LEGACY_PROJECT_PREFIX.length));
        entries.push({ key, snapshot });
      } catch {
        /* skip malformed */
      }
    }
  } catch {
    return;
  }

  if (entries.length === 0) return;

  const migratedKeys: string[] = [];
  for (const entry of entries) {
    if (await projectRepository.saveProjectSnapshot(userId, entry.snapshot)) {
      migratedKeys.push(entry.key);
    }
  }

  for (const key of migratedKeys) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "progetto";
}

function ymd(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 60) return "ora";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h fa`;
  const d = Math.round(h / 24);
  return `${d} g fa`;
}
