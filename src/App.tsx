import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  rectIntersection,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Download,
  RotateCcw,
  Newspaper,
  Plus,
  Maximize2,
  Minimize2,
  X,
  Pencil,
  Save as SaveIcon,
  History,
  Check,
  LogOut,
  FileJson,
} from "lucide-react";
import { MacroGroup } from "./components/MacroGroup";
import { NewsEditor } from "./components/NewsEditor";
import { LoginPage } from "./components/LoginPage";
import { WelcomePage } from "./components/WelcomePage";
import {
  buildPreviewHTML,
  fetchHTML,
  newItem,
  newMacro,
  parseBlog,
  PROXIES,
  PROXY_LABELS,
  type BlogModel,
  type MacroSection,
  type NewsItem,
} from "./lib/parser";
import {
  saveProject,
  listProjects,
  deleteProject,
  newProjectId,
  formatRelative,
  exportProjectToFile,
  importProjectFromFile,
  type SavedProject,
} from "./lib/storage";

const AUTH_KEY = "aperitivo:auth";

export default function App() {
  const [authUser, setAuthUser] = useState<string | null>(() => {
    try { return localStorage.getItem(AUTH_KEY); } catch { return null; }
  });
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [url, setUrl] = useState("https://aisocratic.org/blog/ai-socratic-may-2026");
  const [proxy, setProxy] = useState(PROXIES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [model, setModel] = useState<BlogModel | null>(null);
  const [initialMacroOrder, setInitialMacroOrder] = useState<string>("");
  const [previewURL, setPreviewURL] = useState<string>("");
  const [fullscreen, setFullscreen] = useState(false);
  const [previewEditMode, setPreviewEditMode] = useState(false);
  const [editing, setEditing] = useState<
    | { kind: "item"; macroId: string; itemId: string }
    | { kind: "macro"; macroId: string }
    | null
  >(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>(() => listProjects());
  const editModeSnapshotRef = useRef<BlogModel | null>(null);
  const lastOverContainerRef = useRef<string | null>(null);
  const skipNextPreviewRebuild = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const macroIds = useMemo(() => model?.macros.map((m) => m.id) ?? [], [model]);

  const orderSignature = useMemo(
    () =>
      model
        ? model.macros.map((m) => m.id + ":" + m.items.map((i) => i.id).join(",")).join("|")
        : "",
    [model]
  );
  const hasChanges = orderSignature !== initialMacroOrder && model !== null;

  useEffect(() => {
    if (!model) return;
    if (skipNextPreviewRebuild.current) {
      skipNextPreviewRebuild.current = false;
      return;
    }
    const html = buildPreviewHTML(model, { editMode: previewEditMode });
    const blob = new Blob([html], { type: "text/html" });
    const u = URL.createObjectURL(blob);
    setPreviewURL((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return u;
    });
    return () => URL.revokeObjectURL(u);
  }, [model, previewEditMode]);

  // Receive edits from the preview iframe (postMessage from edit-mode script)
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || typeof data.type !== "string") return;
      const editorTypes = ["post-title", "macro-title", "macro-intro", "item-title", "item-edit"];
      if (editorTypes.includes(data.type)) {
        // The iframe already reflects the change; don't rebuild it & steal focus.
        skipNextPreviewRebuild.current = true;
      }
      setModel((m) => {
        if (!m) return m;
        const next = cloneModel(m);

        if (data.type === "post-title" && typeof data.text === "string") {
          next.header.title = data.text;
          return next;
        }
        if (data.type === "macro-title" && typeof data.id === "string" && typeof data.text === "string") {
          const macro = next.macros.find((x) => x.id === data.id);
          if (macro) {
            macro.title = data.text;
            macro.headingHTML = `<h1 id="${macro.id}" class="macro-heading">${escapeHTML(data.text)}</h1>`;
          }
          return next;
        }
        if (data.type === "macro-intro" && typeof data.id === "string" && typeof data.html === "string") {
          const macro = next.macros.find((x) => x.id === data.id);
          if (macro) macro.introHTML = data.html;
          return next;
        }
        if (data.type === "item-title" && typeof data.id === "string" && typeof data.text === "string") {
          for (const macro of next.macros) {
            const item = macro.items.find((i) => i.id === data.id);
            if (item) {
              item.title = data.text;
              item.headingHTML = `<h${item.level} id="${item.id}" class="news-heading">${escapeHTML(
                data.text
              )}</h${item.level}>`;
              break;
            }
          }
          return next;
        }
        if (data.type === "item-edit" && typeof data.id === "string") {
          for (const macro of next.macros) {
            const item = macro.items.find((i) => i.id === data.id);
            if (item) {
              item.bodyHTML = String(data.html);
              const tmp = document.createElement("div");
              tmp.innerHTML = item.bodyHTML;
              item.snippet = (tmp.textContent || "").replace(/\s+/g, " ").trim().slice(0, 220);
              const firstImg = tmp.querySelector("img");
              item.imageUrl = firstImg?.getAttribute("src") || undefined;
              break;
            }
          }
          return next;
        }
        return m;
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Auto-save model to localStorage (debounced).
  // Paused while previewEditMode is on so intermediate inline edits aren't persisted
  // until the user confirms or discards them.
  useEffect(() => {
    if (!model || !currentProjectId) return;
    if (previewEditMode) return;
    const t = setTimeout(() => {
      const existing = savedProjects.find((p) => p.id === currentProjectId);
      const now = Date.now();
      const project: SavedProject = {
        id: currentProjectId,
        url: model.baseHref,
        title: model.header?.title || model.baseHref,
        createdAt: existing?.createdAt ?? now,
        savedAt: now,
        model,
      };
      if (saveProject(project)) {
        setLastSavedAt(now);
        setSavedProjects(listProjects());
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, currentProjectId, previewEditMode]);

  // Brief "Salvato!" confirmation flash on the Salva button
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 1600);
    return () => clearTimeout(t);
  }, [justSaved]);

  // ESC closes fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  /** Fetch a URL fresh and start a NEW project (independent id, even if URL is reused). */
  async function startNewProject(rawUrl: string) {
    setError(null);
    setLoading(true);
    setModel(null);
    setPreviewURL("");
    try {
      const html = await fetchHTML(rawUrl, proxy);
      const parsed = parseBlog(html, rawUrl);
      const id = newProjectId();
      const now = Date.now();
      const project: SavedProject = {
        id,
        url: rawUrl,
        title: parsed.header?.title || rawUrl,
        createdAt: now,
        savedAt: now,
        model: parsed,
      };
      saveProject(project);
      setCurrentProjectId(id);
      adoptModel(parsed);
      setSavedProjects(listProjects());
      setUrl(rawUrl);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg + " — prova a cambiare CORS proxy.");
    } finally {
      setLoading(false);
    }
  }

  function adoptModel(m: BlogModel) {
    setModel(m);
    setInitialMacroOrder(
      m.macros.map((mc) => mc.id + ":" + mc.items.map((i) => i.id).join(",")).join("|")
    );
  }

  function resumeProject(p: SavedProject) {
    setCurrentProjectId(p.id);
    setUrl(p.url);
    adoptModel(p.model);
  }

  function removeSavedProject(p: SavedProject) {
    if (!window.confirm(`Eliminare il progetto salvato "${p.title}"?`)) return;
    deleteProject(p.id);
    setSavedProjects(listProjects());
    if (currentProjectId === p.id) {
      // We just deleted the open project; bounce to dashboard
      setCurrentProjectId(null);
      setModel(null);
      setPreviewURL("");
    }
  }

  async function reloadFromOriginal() {
    if (!model || !currentProjectId) return;
    if (!window.confirm("Scartare tutte le modifiche di questo progetto e ricaricarlo dall'originale?")) return;
    setLoading(true);
    try {
      const html = await fetchHTML(model.baseHref, proxy);
      const parsed = parseBlog(html, model.baseHref);
      adoptModel(parsed);
      // Auto-save will persist the refreshed model into the same project id
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg + " — prova a cambiare CORS proxy.");
    } finally {
      setLoading(false);
    }
  }

  function saveNow() {
    if (!model || !currentProjectId) return;
    const existing = savedProjects.find((p) => p.id === currentProjectId);
    const now = Date.now();
    const project: SavedProject = {
      id: currentProjectId,
      url: model.baseHref,
      title: model.header?.title || model.baseHref,
      createdAt: existing?.createdAt ?? now,
      savedAt: now,
      model,
    };
    if (saveProject(project)) {
      setLastSavedAt(now);
      setSavedProjects(listProjects());
      setJustSaved(true);
    }
  }

  function handleLogin(username: string) {
    try { localStorage.setItem(AUTH_KEY, username); } catch { /* noop */ }
    setAuthUser(username);
    setSavedProjects(listProjects());
  }

  function handleLogout() {
    try { localStorage.removeItem(AUTH_KEY); } catch { /* noop */ }
    setAuthUser(null);
    setModel(null);
    setPreviewURL("");
    setCurrentProjectId(null);
  }

  function exportCurrent() {
    if (!model || !currentProjectId) return;
    const existing = savedProjects.find((p) => p.id === currentProjectId);
    const now = Date.now();
    const project: SavedProject = {
      id: currentProjectId,
      url: model.baseHref,
      title: model.header?.title || model.baseHref,
      createdAt: existing?.createdAt ?? now,
      savedAt: existing?.savedAt ?? now,
      model,
    };
    exportProjectToFile(project);
  }

  async function importFromFile(file: File) {
    try {
      const project = await importProjectFromFile(file);
      setSavedProjects(listProjects());
      // Open the imported project immediately
      setCurrentProjectId(project.id);
      setUrl(project.url);
      adoptModel(project.model);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("Import fallito: " + msg);
    }
  }

  function backToWelcome() {
    setModel(null);
    setPreviewURL("");
    setCurrentProjectId(null);
    setSavedProjects(listProjects());
  }

  function enterPreviewEdit() {
    if (!model) return;
    // Snapshot the current model so user can discard edits later
    editModeSnapshotRef.current = JSON.parse(JSON.stringify(model)) as BlogModel;
    setPreviewEditMode(true);
  }
  function commitPreviewEdit() {
    editModeSnapshotRef.current = null;
    setPreviewEditMode(false);
  }
  function discardPreviewEdit() {
    if (editModeSnapshotRef.current) {
      setModel(editModeSnapshotRef.current);
    }
    editModeSnapshotRef.current = null;
    setPreviewEditMode(false);
  }

  // ─── DnD helpers ──────────────────────────────────────────────────────────
  function findContainer(activeOrOverId: string): string | null {
    if (!model) return null;
    // Macro container itself
    if (model.macros.some((m) => m.id === activeOrOverId)) return activeOrOverId;
    // Droppable area key "drop-<macroId>"
    if (activeOrOverId.startsWith("drop-")) return activeOrOverId.slice(5);
    // Item id → find which macro contains it
    for (const m of model.macros) {
      if (m.items.some((i) => i.id === activeOrOverId)) return m.id;
    }
    return null;
  }

  // Custom collision: prefer item collisions, fall back to droppable container areas
  const collisionDetection: CollisionDetection = (args) => {
    const pointer = pointerWithin(args);
    if (pointer.length) return pointer;
    const intersections = rectIntersection(args);
    if (intersections.length) return intersections;
    return closestCenter(args);
  };

  function handleDragStart(_e: DragStartEvent) {
    lastOverContainerRef.current = null;
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over || !model) return;
    const activeData = active.data.current as { type?: string; macroId?: string } | undefined;
    if (activeData?.type !== "item") return;

    const overId = String(over.id);
    const activeId = String(active.id);
    const fromContainer = activeData.macroId;
    const toContainer = findContainer(overId);
    if (!fromContainer || !toContainer || fromContainer === toContainer) return;

    // Move the item to the target container in real-time
    setModel((m) => {
      if (!m) return m;
      const next = cloneModel(m);
      const srcMacro = next.macros.find((x) => x.id === fromContainer)!;
      const dstMacro = next.macros.find((x) => x.id === toContainer)!;
      const idx = srcMacro.items.findIndex((i) => i.id === activeId);
      if (idx < 0) return m;
      const [moved] = srcMacro.items.splice(idx, 1);

      // Insert position in dst
      const overIsItem = dstMacro.items.some((i) => i.id === overId);
      const insertAt = overIsItem
        ? dstMacro.items.findIndex((i) => i.id === overId)
        : dstMacro.items.length;
      dstMacro.items.splice(insertAt, 0, moved);
      // Track active container so we can update active.data.current.macroId — dnd-kit will read fresh data on next event
      return next;
    });
    // Patch active.data so subsequent events know new container
    if (activeData) activeData.macroId = toContainer;
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || !model) return;
    const activeData = active.data.current as { type?: string; macroId?: string } | undefined;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeData?.type === "macro") {
      // Reorder macros at the top level
      const oldIndex = model.macros.findIndex((m) => m.id === activeId);
      const newIndex = model.macros.findIndex((m) => m.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      setModel((m) => (m ? { ...m, macros: arrayMove(m.macros, oldIndex, newIndex) } : m));
      return;
    }

    if (activeData?.type === "item") {
      const container = findContainer(overId) || activeData.macroId;
      if (!container) return;
      setModel((m) => {
        if (!m) return m;
        const next = cloneModel(m);
        const macro = next.macros.find((x) => x.id === container)!;
        const items = macro.items;
        const from = items.findIndex((i) => i.id === activeId);
        if (from < 0) return m;
        const overIsItem = items.some((i) => i.id === overId);
        const to = overIsItem ? items.findIndex((i) => i.id === overId) : items.length - 1;
        macro.items = arrayMove(items, from, to);
        return next;
      });
    }
  }

  // ─── Mutations ────────────────────────────────────────────────────────────
  function deleteItem(macroId: string, itemId: string) {
    setModel((m) => {
      if (!m) return m;
      const next = cloneModel(m);
      const macro = next.macros.find((x) => x.id === macroId);
      if (!macro) return m;
      macro.items = macro.items.filter((i) => i.id !== itemId);
      return next;
    });
  }
  function renameItem(macroId: string, itemId: string) {
    setEditing({ kind: "item", macroId, itemId });
  }
  function editMacro(macroId: string) {
    setEditing({ kind: "macro", macroId });
  }

  function applyEdit(updates: { title: string; bodyHTML: string }) {
    if (!editing) return;
    setModel((m) => {
      if (!m) return m;
      const next = cloneModel(m);
      if (editing.kind === "item") {
        const macroN = next.macros.find((x) => x.id === editing.macroId);
        const itemN = macroN?.items.find((i) => i.id === editing.itemId);
        if (!itemN) return m;
        itemN.title = updates.title;
        itemN.headingHTML = `<h${itemN.level} id="${itemN.id}" class="news-heading">${escapeHTML(
          updates.title
        )}</h${itemN.level}>`;
        itemN.bodyHTML = updates.bodyHTML;
        const tmp = document.createElement("div");
        tmp.innerHTML = updates.bodyHTML;
        itemN.snippet = (tmp.textContent || "").replace(/\s+/g, " ").trim().slice(0, 220);
        const firstImg = tmp.querySelector("img");
        itemN.imageUrl = firstImg?.getAttribute("src") || undefined;
      } else {
        const macroN = next.macros.find((x) => x.id === editing.macroId);
        if (!macroN) return m;
        macroN.title = updates.title;
        macroN.headingHTML = `<h1 id="${macroN.id}" class="macro-heading">${escapeHTML(
          updates.title
        )}</h1>`;
        macroN.introHTML = updates.bodyHTML;
      }
      return next;
    });
    setEditing(null);
  }

  // Build a NewsItem-shaped target for the editor that works for both items and macros
  const editingTarget = useMemo(() => {
    if (!editing || !model) return null;
    if (editing.kind === "item") {
      const macro = model.macros.find((x) => x.id === editing.macroId);
      const item = macro?.items.find((i) => i.id === editing.itemId);
      if (!item) return null;
      return { item, kind: "News" as const };
    }
    const macro = model.macros.find((x) => x.id === editing.macroId);
    if (!macro) return null;
    const adapted = {
      id: macro.id,
      title: macro.title,
      level: 2 as const,
      headingHTML: macro.headingHTML,
      bodyHTML: macro.introHTML,
      snippet: "",
    };
    return { item: adapted, kind: "Sezione" as const };
  }, [editing, model]);
  function addItem(macroId: string) {
    const it = newItem("Nuova news");
    setModel((m) => {
      if (!m) return m;
      const next = cloneModel(m);
      const macro = next.macros.find((x) => x.id === macroId)!;
      macro.items.push(it);
      return next;
    });
    // Open the editor immediately so user can add title, body, image, sources
    setEditing({ kind: "item", macroId, itemId: it.id });
  }
  function deleteMacro(macroId: string) {
    if (!window.confirm("Eliminare l'intera macro-sezione?")) return;
    setModel((m) => {
      if (!m) return m;
      return { ...m, macros: m.macros.filter((x) => x.id !== macroId) };
    });
  }
  function addMacro() {
    const mac = newMacro("Nuova macro-sezione");
    setModel((m) => (m ? { ...m, macros: [...m.macros, mac] } : m));
    setEditing({ kind: "macro", macroId: mac.id });
  }
  function resetOrder() {
    reloadFromOriginal();
  }

  function handleDownload() {
    if (!previewURL) return;
    const a = document.createElement("a");
    a.href = previewURL;
    const slug = (model?.baseHref.split("/").pop() || "blog") + "-reordered";
    a.download = slug + ".html";
    a.click();
  }

  // ─── Login & Welcome routing ─────────────────────────────────────────────
  if (!authUser) {
    return <LoginPage onLogin={handleLogin} />;
  }
  if (!model) {
    return (
      <WelcomePage
        username={authUser}
        savedProjects={savedProjects}
        loading={loading}
        initialURL={url}
        onLoadURL={(u) => startNewProject(u)}
        onResume={(p) => resumeProject(p)}
        onDelete={(p) => removeSavedProject(p)}
        onImport={(f) => importFromFile(f)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-ink-900 text-ink-100">
      <header className="px-6 py-3 border-b border-ink-600 bg-gradient-to-b from-ink-800 to-ink-900 flex items-center gap-4 sticky top-0 z-10">
        <button
          onClick={backToWelcome}
          className="flex items-center gap-2 font-semibold hover:opacity-80 transition"
          title="Torna alla dashboard"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-mint flex items-center justify-center">
            <Newspaper size={16} className="text-ink-950" />
          </div>
          <span className="text-sm tracking-tight">AI Aperitivo · Blog Maker</span>
        </button>

        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-xs text-ink-300 truncate">
            <span className="text-ink-100 font-medium">{model.header?.title || "(senza titolo)"}</span>
            <span className="opacity-60 mx-2">·</span>
            <code className="text-brand-400">{model.baseHref}</code>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={backToWelcome}
            className="px-3 py-2 rounded-lg border border-ink-600 hover:border-brand
                       text-sm flex items-center gap-2 transition"
            title="Torna alla dashboard"
          >
            <History size={13} /> Progetti
          </button>
          {lastSavedAt && model && (
            <span
              className="text-[11px] text-ink-300 flex items-center gap-1.5 mr-1"
              title={`Auto-salvato in localStorage · ${new Date(lastSavedAt).toLocaleString()}`}
            >
              <SaveIcon size={11} className="text-mint" />
              Salvato {formatRelative(lastSavedAt)}
            </span>
          )}
          <button
            onClick={saveNow}
            disabled={!model}
            className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 transition
                       disabled:opacity-40 disabled:cursor-not-allowed
                       ${
                         justSaved
                           ? "bg-mint border-mint text-ink-950 font-semibold"
                           : "border-ink-600 hover:border-mint hover:text-mint"
                       }`}
            title="Salva ora il progetto"
          >
            {justSaved ? (
              <>
                <Check size={14} /> Salvato!
              </>
            ) : (
              <>
                <SaveIcon size={13} /> Salva
              </>
            )}
          </button>
          <button
            onClick={resetOrder}
            disabled={!hasChanges}
            className="px-3 py-2 rounded-lg border border-ink-600 hover:border-ink-500
                       text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <RotateCcw size={13} /> Reset
          </button>
          <button
            onClick={exportCurrent}
            disabled={!model}
            className="px-3 py-2 rounded-lg border border-ink-600 hover:border-brand hover:text-brand-400
                       text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Esporta il progetto come file JSON (puoi mandarlo a un amico)"
          >
            <FileJson size={13} /> Esporta JSON
          </button>
          <button
            onClick={handleDownload}
            disabled={!previewURL}
            className="px-3 py-2 rounded-lg bg-mint hover:brightness-110 text-ink-950
                       text-sm font-semibold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Download size={14} /> Scarica HTML
          </button>
          <div className="w-px h-6 bg-ink-600 mx-1" />
          <span className="text-xs text-ink-300 capitalize hidden sm:block">{authUser}</span>
          <button
            onClick={handleLogout}
            className="px-2.5 py-2 rounded-lg border border-ink-600 hover:border-red-500 hover:text-red-400 text-xs flex items-center gap-1.5 transition"
            title="Logout"
          >
            <LogOut size={12} />
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden">
        {/* LEFT: editor */}
        <section className="overflow-y-auto scroll-thin border-r border-ink-600 p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-sm">
              {error}
            </div>
          )}



          {model && (
            <>
              <div className="mb-6 rounded-2xl border border-ink-600 bg-gradient-to-br from-ink-800 to-ink-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-brand-400 bg-brand/15 px-2 py-1 rounded">
                    Intestazione · fissa
                  </span>
                  {model.header.meta && (
                    <span className="text-xs text-ink-300">{model.header.meta}</span>
                  )}
                </div>
                <h2 className="text-xl font-semibold text-ink-100 leading-tight">
                  {model.header.title || "(senza titolo)"}
                </h2>
              </div>

              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] uppercase tracking-widest font-bold text-ink-300">
                  Macro-sezioni · trascina le card per riordinare
                </h3>
                <span className="text-xs text-ink-300">
                  {model.macros.length} sezioni ·{" "}
                  {model.macros.reduce((acc, m) => acc + m.items.length, 0)} news
                </span>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={collisionDetection}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={macroIds} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-3">
                    {model.macros.map((m, i) => (
                      <MacroGroup
                        key={m.id}
                        macro={m}
                        index={i}
                        onRenameMacro={() => editMacro(m.id)}
                        onDeleteMacro={() => deleteMacro(m.id)}
                        onAddItem={() => addItem(m.id)}
                        onRenameItem={(itemId) => renameItem(m.id, itemId)}
                        onDeleteItem={(itemId) => deleteItem(m.id, itemId)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <button
                onClick={addMacro}
                className="mt-4 w-full border border-dashed border-ink-600 hover:border-brand
                           text-ink-300 hover:text-brand-400 rounded-xl py-3 text-sm
                           flex items-center justify-center gap-2 transition"
              >
                <Plus size={14} /> Aggiungi macro-sezione
              </button>
            </>
          )}

          <details className="mt-6 text-xs text-ink-300">
            <summary className="cursor-pointer hover:text-ink-100">
              CORS proxy (cambia se il caricamento fallisce)
            </summary>
            <div className="mt-2 flex gap-2 flex-wrap">
              {PROXIES.map((p, i) => (
                <label
                  key={i}
                  className={`px-3 py-1.5 rounded-md border cursor-pointer text-xs transition
                    ${
                      proxy === p
                        ? "border-brand bg-brand/15 text-ink-100"
                        : "border-ink-600 hover:border-ink-500"
                    }`}
                >
                  <input
                    type="radio"
                    name="proxy"
                    checked={proxy === p}
                    onChange={() => setProxy(p)}
                    className="hidden"
                  />
                  {PROXY_LABELS[i]}
                </label>
              ))}
            </div>
          </details>
        </section>

        {/* RIGHT: live preview */}
        <section className="overflow-hidden p-6 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] uppercase tracking-widest font-bold text-ink-300">
              Anteprima live
            </h3>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <span className="text-[10px] uppercase tracking-widest font-bold text-mint bg-mint/10 px-2 py-1 rounded">
                  Modificato
                </span>
              )}
              {previewEditMode ? (
                <>
                  <button
                    onClick={discardPreviewEdit}
                    className="px-2.5 py-1.5 rounded-md border border-ink-600 hover:border-red-500 hover:text-red-400 text-xs flex items-center gap-1.5 transition"
                    title="Scarta tutte le modifiche fatte in modalità modifica e torna alla versione precedente"
                  >
                    <X size={12} /> Scarta modifiche
                  </button>
                  <button
                    onClick={commitPreviewEdit}
                    className="px-2.5 py-1.5 rounded-md bg-mint hover:brightness-110 text-ink-950 text-xs font-semibold flex items-center gap-1.5"
                    title="Conferma le modifiche e torna alla preview"
                  >
                    ✓ Conferma
                  </button>
                </>
              ) : (
                <button
                  onClick={enterPreviewEdit}
                  disabled={!previewURL}
                  className="px-2.5 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition border
                             border-ink-600 hover:border-brand text-ink-300 hover:text-brand-400
                             disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Modifica in linea direttamente nell'anteprima"
                >
                  <Pencil size={12} /> Modifica
                </button>
              )}
              <button
                onClick={() => setFullscreen(true)}
                disabled={!previewURL}
                className="px-2.5 py-1.5 rounded-md border border-ink-600 hover:border-brand
                           text-ink-300 hover:text-brand-400 disabled:opacity-40 disabled:cursor-not-allowed
                           text-xs flex items-center gap-1.5 transition"
                title="Apri anteprima a schermo intero"
              >
                <Maximize2 size={12} /> Fullscreen
              </button>
            </div>
          </div>
          <div className="flex-1 rounded-xl border border-ink-600 overflow-hidden bg-[#0c0d11]">
            {previewURL ? (
              <iframe
                src={previewURL}
                title="Preview"
                className="w-full h-full"
                sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-ink-500 bg-ink-800">
                <span className="text-sm">L'anteprima apparirà qui dopo il caricamento.</span>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Editor modal (news or macro-sezione) */}
      {editingTarget && (
        <NewsEditor
          key={editingTarget.item.id + ":" + editingTarget.kind}
          item={editingTarget.item}
          kind={editingTarget.kind}
          onSave={applyEdit}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Fullscreen preview overlay */}
      {fullscreen && previewURL && (
        <div className="fixed inset-0 z-50 bg-ink-950/95 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-ink-600 bg-ink-900">
            <div className="text-sm font-medium text-ink-100 flex items-center gap-2">
              <Newspaper size={14} className="text-brand-400" />
              Anteprima · {model?.header.title || "Preview"}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 rounded-md bg-mint text-ink-950 text-xs font-semibold flex items-center gap-1.5"
              >
                <Download size={12} /> Scarica HTML
              </button>
              <button
                onClick={() => setFullscreen(false)}
                className="px-3 py-1.5 rounded-md border border-ink-600 hover:border-brand text-xs flex items-center gap-1.5"
                title="Esci (Esc)"
              >
                <Minimize2 size={12} /> Esci
              </button>
              <button
                onClick={() => setFullscreen(false)}
                className="w-8 h-8 rounded-md border border-ink-600 hover:border-red-500 hover:text-red-400 flex items-center justify-center"
                aria-label="Chiudi"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <iframe
            src={previewURL}
            title="Preview fullscreen"
            className="flex-1 w-full bg-[#0c0d11]"
            sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals"
          />
        </div>
      )}
    </div>
  );
}

// ─── Utilities ──────────────────────────────────────────────────────────────
function cloneModel(m: BlogModel): BlogModel {
  return {
    ...m,
    macros: m.macros.map((mc: MacroSection) => ({ ...mc, items: mc.items.map((i: NewsItem) => ({ ...i })) })),
  };
}
function escapeHTML(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
