import { useRef, useState } from "react";
import {
  Sparkles,
  Link as LinkIcon,
  Loader2,
  Newspaper,
  History,
  Trash2,
  LogOut,
  Plus,
  Upload,
  Cloud,
} from "lucide-react";
import { formatRelative, type ProjectDocument } from "../lib/storage";
import type { RemoteStorageSettings } from "../lib/remoteSync";

type Props = {
  username: string;
  savedProjects: ProjectDocument[];
  loading: boolean;
  initialURL: string;
  onLoadURL: (url: string) => void;
  onResume: (project: ProjectDocument) => void;
  onDelete: (project: ProjectDocument) => void;
  onImport: (file: File) => void;
  remoteSettings: RemoteStorageSettings;
  onRemoteSettingsChange: (updates: Partial<RemoteStorageSettings>) => void;
  remoteConfigured: boolean;
  onLogout: () => void;
};

export function WelcomePage({
  username,
  savedProjects,
  loading,
  initialURL,
  onLoadURL,
  onResume,
  onDelete,
  onImport,
  remoteSettings,
  onRemoteSettingsChange,
  remoteConfigured,
  onLogout,
}: Props) {
  const [url, setUrl] = useState(initialURL);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-full flex flex-col bg-ink-900 text-ink-100">
      {/* Compact top bar */}
      <header className="px-6 py-3 border-b border-ink-600 bg-gradient-to-b from-ink-800 to-ink-900 flex items-center gap-4">
        <div className="flex items-center gap-2 font-semibold">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-mint flex items-center justify-center">
            <Newspaper size={16} className="text-ink-950" />
          </div>
          <span className="text-sm tracking-tight">AI Socratic · Blog Maker</span>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-ink-300">
          Bentornato, <span className="text-ink-100 font-semibold capitalize">{username}</span>
        </span>
        <button
          onClick={onLogout}
          className="px-3 py-1.5 rounded-md border border-ink-600 hover:border-red-500 hover:text-red-400 text-xs flex items-center gap-1.5 transition"
          title="Esci"
        >
          <LogOut size={12} /> Logout
        </button>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/15 border border-brand/30 text-brand-400 text-[11px] font-bold uppercase tracking-widest mb-4">
              <Sparkles size={11} /> Dashboard
            </div>
            <h1
              className="font-bold tracking-tight leading-tight mb-3"
              style={{
                fontSize: "clamp(32px, 5vw, 56px)",
                background: "linear-gradient(120deg, #ffffff 0%, #c4b8ff 50%, #5fffce 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.025em",
              }}
            >
              Da dove vuoi cominciare?
            </h1>
            <p className="text-ink-300 text-sm">
              Inizia un nuovo progetto da un URL di AI Socratic, o riprendi un lavoro già iniziato.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Card: new project */}
            <div className="rounded-2xl border border-ink-600 bg-gradient-to-b from-ink-800 to-ink-900 p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 flex items-center justify-center text-brand-400">
                  <Plus size={18} />
                </div>
                <div>
                  <h2 className="font-semibold text-ink-100">Nuovo progetto</h2>
                  <p className="text-[11px] text-ink-300">Parti da un blog post di aisocratic.org</p>
                </div>
              </div>

              <div className="space-y-3 flex-1 flex flex-col">
                <div className="relative">
                  <LinkIcon
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300"
                  />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && url.trim() && onLoadURL(url.trim())}
                    placeholder="https://aisocratic.org/blog/..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-ink-800 border border-ink-600 text-sm
                               focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                  />
                </div>
                <div className="text-[11px] text-ink-300">
                  Esempi:{" "}
                  <button
                    onClick={() => setUrl("https://aisocratic.org/blog/ai-socratic-may-2026")}
                    className="text-brand-400 hover:underline"
                  >
                    maggio 2026
                  </button>
                  {" · "}
                  <button
                    onClick={() => setUrl("https://aisocratic.org/blog/ai-socratic-april-2026")}
                    className="text-brand-400 hover:underline"
                  >
                    aprile 2026
                  </button>
                </div>

                <div className="flex-1" />

                <button
                  onClick={() => url.trim() && onLoadURL(url.trim())}
                  disabled={loading || !url.trim()}
                  className="w-full py-2.5 rounded-lg bg-brand hover:brightness-110 text-white text-sm font-semibold flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  {loading ? "Carico…" : "Inizia"}
                </button>

                <div className="relative flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-ink-600" />
                  <span className="text-[10px] uppercase tracking-widest font-bold text-ink-300">oppure</span>
                  <div className="flex-1 h-px bg-ink-600" />
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImport(f);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg border border-dashed border-ink-600 hover:border-brand hover:text-brand-400
                             text-ink-300 text-sm font-medium flex items-center justify-center gap-2 transition
                             disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Importa un file .json esportato da un altro dispositivo"
                >
                  <Upload size={14} /> Importa progetto da file JSON
                </button>
              </div>
            </div>

            {/* Card: resume project */}
            <div className="rounded-2xl border border-ink-600 bg-gradient-to-b from-ink-800 to-ink-900 p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-mint/15 border border-mint/30 flex items-center justify-center text-mint">
                  <History size={18} />
                </div>
                <div>
                  <h2 className="font-semibold text-ink-100">Progetti salvati</h2>
                  <p className="text-[11px] text-ink-300">
                    {savedProjects.length === 0
                      ? "Nessun progetto ancora salvato"
                      : `${savedProjects.length} ${savedProjects.length === 1 ? "progetto disponibile" : "progetti disponibili"}`}
                  </p>
                </div>
              </div>

              {savedProjects.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-center text-ink-300 text-xs italic border border-dashed border-ink-600 rounded-lg p-8">
                  I progetti vengono salvati automaticamente nel browser al primo edit. La sincronizzazione condivisa parte a blocchi quando rileva modifiche locali.
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto scroll-thin pr-1">
                  {savedProjects.map((p) => (
                    <div
                      key={p.id}
                      className="group flex items-center gap-3 rounded-lg border border-ink-600
                                 bg-ink-800 hover:bg-ink-700 hover:border-brand/60 transition px-3 py-2.5"
                    >
                      <div
                        onClick={() => onResume(p)}
                        className="flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="font-medium text-sm text-ink-100 truncate">{p.title}</div>
                        <div className="text-[11px] text-ink-300 truncate flex items-center gap-2">
                          <span>{formatRelative(p.savedAt)}</span>
                          <span className="opacity-60">·</span>
                          <code className="text-brand-400 truncate">{p.sourceUrl}</code>
                        </div>
                      </div>
                      <button
                        onClick={() => onResume(p)}
                        className="text-[11px] px-2.5 py-1 rounded bg-brand hover:brightness-110 text-white font-semibold whitespace-nowrap"
                      >
                        Riprendi
                      </button>
                      <button
                        onClick={() => onDelete(p)}
                        className="w-7 h-7 rounded border border-ink-600 hover:border-red-500 hover:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        title="Elimina progetto salvato"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="lg:col-span-2 rounded-2xl border border-ink-600 bg-gradient-to-b from-ink-800 to-ink-900 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 flex items-center justify-center text-brand-400">
                  <Cloud size={18} />
                </div>
                <div>
                  <h2 className="font-semibold text-ink-100">Archivio condiviso</h2>
                  <p className="text-[11px] text-ink-300">
                    La copia nel browser resta autosalvata; la copia condivisa viene aggiornata automaticamente a blocchi.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-widest font-bold text-ink-300">Credenziale sessione</span>
                  <input
                    type="password"
                    value={remoteSettings.accessKey}
                    onChange={(e) => onRemoteSettingsChange({ accessKey: e.target.value })}
                    placeholder="Inserisci la credenziale di sessione"
                    className="w-full px-3 py-2.5 rounded-lg bg-ink-800 border border-ink-600 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-300">
                <span
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border ${
                    remoteConfigured ? "border-mint/40 bg-mint/10 text-mint" : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                  }`}
                >
                  <Cloud size={11} />
                  {remoteConfigured ? "Archivio remoto pronto" : "Serve una credenziale di sessione per attivare la sincronizzazione"}
                </span>
                <span>La credenziale viene tenuta solo per la sessione corrente.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
