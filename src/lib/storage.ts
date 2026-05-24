import type { BlogModel } from "./parser";

const DB_NAME = "aisocratic-blog-maker";
const DB_VERSION = 1;
const PROJECTS_STORE = "projects";
const PROJECTS_BY_USER_INDEX = "by-userId";
const SOURCES_STORE = "source-cache";

const LEGACY_PROJECT_PREFIX = "aperitivo:project:";
const FILE_FORMAT = "aisocratic-project-v2";

export type SavedProject = {
  id: string;
  userId: string;
  url: string;
  sourceUrl: string;
  title: string;
  createdAt: number;
  savedAt: number;
  model: BlogModel;
  remoteIssueNumber?: number | null;
  remoteRevision?: string | null;
};

export type CachedSource = {
  sourceUrl: string;
  html: string;
  model: BlogModel;
  fetchedAt: number;
};

type LegacyProjectShape = Partial<SavedProject> & {
  model?: BlogModel;
  savedAt?: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

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

export async function saveProject(project: SavedProject): Promise<boolean> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(PROJECTS_STORE, "readwrite");
    tx.objectStore(PROJECTS_STORE).put(normalizeProject(project));
    await waitForTransaction(tx);
    return true;
  } catch {
    return false;
  }
}

export async function loadProject(id: string): Promise<SavedProject | null> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(PROJECTS_STORE, "readonly");
    const raw = await requestAsPromise<unknown>(tx.objectStore(PROJECTS_STORE).get(id));
    await waitForTransaction(tx);
    return isSavedProject(raw) ? normalizeProject(raw) : null;
  } catch {
    return null;
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(PROJECTS_STORE, "readwrite");
    tx.objectStore(PROJECTS_STORE).delete(id);
    await waitForTransaction(tx);
  } catch {
    /* noop */
  }
}

export async function listProjects(userId: string): Promise<SavedProject[]> {
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
      .filter(isSavedProject)
      .map((project) => normalizeProject(project))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function loadCachedSource(url: string): Promise<CachedSource | null> {
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
}

export async function saveCachedSource(source: CachedSource): Promise<boolean> {
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

function normalizeProject(project: SavedProject): SavedProject {
  const sourceUrl = resolveProjectSourceUrl(project);
  const url = sourceUrl || canonicalizeSourceUrl(project.url) || project.url;
  return {
    ...project,
    userId: normalizeUserId(project.userId),
    url,
    sourceUrl: sourceUrl || url,
    title: project.title || project.model.header?.title || url,
    remoteIssueNumber:
      typeof project.remoteIssueNumber === "number" ? project.remoteIssueNumber : null,
    remoteRevision: typeof project.remoteRevision === "string" ? project.remoteRevision : null,
  };
}

function resolveProjectSourceUrl(project: {
  sourceUrl?: string;
  url?: string;
  model: Pick<BlogModel, "baseHref">;
}): string {
  return canonicalizeSourceUrl(project.sourceUrl || project.url || project.model.baseHref || "");
}

function isSavedProject(value: unknown): value is SavedProject {
  return !!value && typeof value === "object" && "id" in value && "model" in value && "userId" in value;
}

function isCachedSource(value: unknown): value is CachedSource {
  return !!value && typeof value === "object" && "sourceUrl" in value && "model" in value && "html" in value;
}

async function migrateLegacyLocalStorageProjects(userId: string): Promise<void> {
  if (typeof localStorage === "undefined") return;

  const entries: Array<{ key: string; project: SavedProject }> = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LEGACY_PROJECT_PREFIX)) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw) as LegacyProjectShape;
        if (!parsed.model || !Array.isArray(parsed.model.macros)) continue;

        const suffix = key.slice(LEGACY_PROJECT_PREFIX.length);
        const id = typeof parsed.id === "string" && parsed.id ? parsed.id : newProjectId();
        const sourceUrl = resolveProjectSourceUrl({
          sourceUrl: parsed.sourceUrl,
          url: parsed.url || suffix,
          model: parsed.model,
        });
        const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now();
        const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : savedAt;

        entries.push({
          key,
          project: normalizeProject({
            id,
            userId,
            url: sourceUrl,
            sourceUrl,
            title: parsed.title || parsed.model.header?.title || sourceUrl,
            createdAt,
            savedAt,
            model: parsed.model,
            remoteIssueNumber:
              typeof parsed.remoteIssueNumber === "number" ? parsed.remoteIssueNumber : null,
            remoteRevision:
              typeof parsed.remoteRevision === "string" ? parsed.remoteRevision : null,
          }),
        });
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
    if (await saveProject(entry.project)) {
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

export function exportProjectToFile(project: SavedProject): void {
  const payload = { _format: FILE_FORMAT, ...project };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aisocratic-${slugify(project.title)}-${ymd(project.savedAt)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importProjectFromFile(file: File, userId: string): Promise<SavedProject> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("File non è JSON valido.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("model" in parsed) ||
    typeof (parsed as { model: unknown }).model !== "object"
  ) {
    throw new Error("File non riconosciuto: manca il campo 'model'.");
  }

  const p = parsed as LegacyProjectShape & { _format?: string };
  const model = p.model as BlogModel | undefined;
  if (!model || !Array.isArray(model.macros)) {
    throw new Error("File non valido: 'model.macros' assente o non un array.");
  }

  const now = Date.now();
  const sourceUrl = resolveProjectSourceUrl({
    sourceUrl: p.sourceUrl,
    url: p.url,
    model,
  });
  const project = normalizeProject({
    id: newProjectId(),
    userId,
    url: sourceUrl,
    sourceUrl,
    title: p.title || model.header?.title || file.name.replace(/\.json$/, ""),
    createdAt: typeof p.createdAt === "number" ? p.createdAt : now,
    savedAt: now,
    model,
    remoteIssueNumber: typeof p.remoteIssueNumber === "number" ? p.remoteIssueNumber : null,
    remoteRevision: typeof p.remoteRevision === "string" ? p.remoteRevision : null,
  });

  if (!(await saveProject(project))) {
    throw new Error("Impossibile salvare nel database del browser (IndexedDB).");
  }

  return project;
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
