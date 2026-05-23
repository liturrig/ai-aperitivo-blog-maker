import type { BlogModel } from "./parser";

const PREFIX = "aperitivo:project:";

export type SavedProject = {
  id: string;
  url: string;
  title: string;
  createdAt: number;
  savedAt: number;
  model: BlogModel;
};

export function newProjectId(): string {
  return "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function saveProject(project: SavedProject): boolean {
  try {
    localStorage.setItem(PREFIX + project.id, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

export function loadProject(id: string): SavedProject | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as SavedProject;
  } catch {
    return null;
  }
}

export function deleteProject(id: string): void {
  try { localStorage.removeItem(PREFIX + id); } catch { /* noop */ }
}

export function listProjects(): SavedProject[] {
  const out: SavedProject[] = [];
  try {
    // Migrate any legacy URL-keyed entries to the new id-based format.
    migrateLegacyKeys();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const rest = key.slice(PREFIX.length);
      if (!rest.startsWith("p_")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as SavedProject;
        if (parsed && parsed.id && parsed.model) out.push(parsed);
      } catch { /* skip malformed */ }
    }
  } catch { /* noop */ }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

function migrateLegacyKeys() {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    const rest = key.slice(PREFIX.length);
    if (rest.startsWith("p_")) continue; // already new
    if (!rest.startsWith("http")) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const old = JSON.parse(raw) as { model?: BlogModel; savedAt?: number };
      if (!old.model) continue;
      const id = newProjectId();
      const now = old.savedAt || Date.now();
      const project: SavedProject = {
        id,
        url: rest,
        title: old.model.header?.title || rest,
        createdAt: now,
        savedAt: now,
        model: old.model,
      };
      localStorage.setItem(PREFIX + id, JSON.stringify(project));
      toRemove.push(key);
    } catch { /* skip */ }
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
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
