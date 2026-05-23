import type { BlogModel } from "./parser";

const PREFIX = "aperitivo:project:";

export type SavedProject = {
  url: string;
  savedAt: number;
  title: string;
  model: BlogModel;
};

export function saveProject(model: BlogModel): boolean {
  try {
    const key = PREFIX + model.baseHref;
    const payload = JSON.stringify({ model, savedAt: Date.now() });
    localStorage.setItem(key, payload);
    return true;
  } catch {
    return false;
  }
}

export function loadProject(url: string): SavedProject | null {
  try {
    const raw = localStorage.getItem(PREFIX + url);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { model: BlogModel; savedAt: number };
    return {
      url,
      savedAt: parsed.savedAt,
      title: parsed.model.header?.title || url,
      model: parsed.model,
    };
  } catch {
    return null;
  }
}

export function deleteProject(url: string): void {
  try { localStorage.removeItem(PREFIX + url); } catch { /* noop */ }
}

export function listProjects(): SavedProject[] {
  const out: SavedProject[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const url = key.slice(PREFIX.length);
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { model: BlogModel; savedAt: number };
        out.push({
          url,
          savedAt: parsed.savedAt,
          title: parsed.model.header?.title || url,
          model: parsed.model,
        });
      } catch { /* skip */ }
    }
  } catch { /* noop */ }
  return out.sort((a, b) => b.savedAt - a.savedAt);
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
