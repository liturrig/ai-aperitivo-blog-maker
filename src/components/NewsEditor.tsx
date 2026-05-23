import { useEffect, useMemo, useRef, useState } from "react";
import { X, Save, Image as ImageIcon, Trash2, Replace, Link as LinkIcon, FileText } from "lucide-react";
import type { NewsItem } from "../lib/parser";

type Props = {
  item: NewsItem;
  kind?: "News" | "Sezione";
  onSave: (updates: { title: string; bodyHTML: string }) => void;
  onClose: () => void;
};

export function NewsEditor({ item, kind = "News", onSave, onClose }: Props) {
  const badge = kind === "Sezione" ? "H1" : `H${item.level}`;
  const badgeClass =
    kind === "Sezione"
      ? "bg-gradient-to-r from-brand/30 to-mint/30 text-white"
      : item.level === 2
      ? "bg-brand/20 text-brand-400"
      : "bg-ink-600 text-ink-300";
  const [title, setTitle] = useState(item.title);
  const [bodyHTML, setBodyHTML] = useState(item.bodyHTML);
  const bodyRef = useRef<HTMLDivElement>(null);
  const initializedItemId = useRef<string>("");

  // Initialize the contenteditable ONCE per item id. React is NOT allowed to manage
  // innerHTML during edits (no dangerouslySetInnerHTML), to prevent it from wiping user typing.
  useEffect(() => {
    if (bodyRef.current && initializedItemId.current !== item.id) {
      bodyRef.current.innerHTML = item.bodyHTML;
      initializedItemId.current = item.id;
    }
  }, [item.id, item.bodyHTML]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, bodyHTML]);

  function syncFromDOM(): string {
    return bodyRef.current?.innerHTML ?? bodyHTML;
  }

  function save() {
    onSave({ title: title.trim() || item.title, bodyHTML: syncFromDOM() });
  }

  // Image management
  const images = useMemo(() => {
    const div = document.createElement("div");
    div.innerHTML = bodyHTML;
    return Array.from(div.querySelectorAll("img")).map((img, i) => ({
      idx: i,
      src: img.getAttribute("src") || "",
      alt: img.getAttribute("alt") || "",
    }));
  }, [bodyHTML]);

  function replaceImage(idx: number) {
    const current = images[idx]?.src || "";
    const url = window.prompt("Nuovo URL immagine:", current);
    if (!url) return;
    mutateImage(idx, (img) => img.setAttribute("src", url));
  }
  function deleteImage(idx: number) {
    if (!window.confirm("Eliminare questa immagine?")) return;
    mutateImage(idx, (img) => img.remove());
  }
  function addImage() {
    const url = window.prompt("URL della nuova immagine:", "");
    if (!url) return;
    const html = `\n<p><img src="${escapeAttr(url)}" alt="" /></p>`;
    if (bodyRef.current) {
      bodyRef.current.innerHTML += html;
      setBodyHTML(bodyRef.current.innerHTML);
    } else {
      setBodyHTML(bodyHTML + html);
    }
  }
  function addLink() {
    const url = window.prompt("URL del link:", "https://");
    if (!url) return;
    const label = window.prompt("Testo del link:", "link");
    if (!label) return;
    const linkHTML = `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(
      label
    )}</a>`;
    // Try to insert at the current selection (if user clicked inside the body)
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && bodyRef.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.innerHTML = linkHTML;
      range.deleteContents();
      range.insertNode(span.firstChild as Node);
      setBodyHTML(bodyRef.current.innerHTML);
      return;
    }
    // Otherwise append
    if (bodyRef.current) {
      bodyRef.current.innerHTML += ` ${linkHTML}`;
      setBodyHTML(bodyRef.current.innerHTML);
    } else {
      setBodyHTML(bodyHTML + ` ${linkHTML}`);
    }
  }
  function addSourcesLine() {
    const url = window.prompt("URL della source:", "https://");
    if (!url) return;
    const label = window.prompt("Etichetta (es. tweet, paper, blog):", "tweet");
    if (label === null) return;
    const html = `\n<p>Sources: <a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(
      label || "link"
    )}</a></p>`;
    if (bodyRef.current) {
      bodyRef.current.innerHTML += html;
      setBodyHTML(bodyRef.current.innerHTML);
    } else {
      setBodyHTML(bodyHTML + html);
    }
  }
  function mutateImage(idx: number, fn: (el: Element) => void) {
    const root = bodyRef.current;
    if (!root) return;
    const imgs = Array.from(root.querySelectorAll("img"));
    const target = imgs[idx];
    if (!target) return;
    fn(target);
    setBodyHTML(root.innerHTML);
  }

  return (
    <div className="fixed inset-0 z-40 bg-ink-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col bg-ink-900 border border-ink-600 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-ink-600 bg-ink-800">
          <span className={`text-[10px] font-bold rounded px-2 py-0.5 ${badgeClass}`}>
            {badge}
          </span>
          <h2 className="flex-1 font-semibold text-ink-100">
            Modifica {kind === "Sezione" ? "macro-sezione" : "news"}
          </h2>
          <button
            onClick={save}
            className="px-3 py-1.5 rounded-md bg-mint hover:brightness-110 text-ink-950 text-xs font-semibold flex items-center gap-1.5"
            title="Salva (⌘S)"
          >
            <Save size={12} /> Salva
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md border border-ink-600 hover:border-red-500 hover:text-red-400 flex items-center justify-center"
            aria-label="Chiudi (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scroll-thin p-5 space-y-5">
          <div>
            <label className="block text-[11px] uppercase tracking-widest font-bold text-ink-300 mb-2">
              Titolo
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-ink-800 border border-ink-600 text-sm
                         focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] uppercase tracking-widest font-bold text-ink-300">
                {kind === "Sezione" ? "Intro della sezione" : "Contenuto"}
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={addLink}
                  className="text-[10px] text-ink-300 hover:text-brand-400 border border-ink-600 hover:border-brand rounded px-2 py-1 flex items-center gap-1 transition"
                  title="Aggiungi un link (anteprima seleziona il testo per linkarlo)"
                >
                  <LinkIcon size={11} /> Link
                </button>
                <button
                  type="button"
                  onClick={addSourcesLine}
                  className="text-[10px] text-ink-300 hover:text-brand-400 border border-ink-600 hover:border-brand rounded px-2 py-1 flex items-center gap-1 transition"
                  title="Aggiungi una riga 'Sources: …' in fondo"
                >
                  <FileText size={11} /> Sources
                </button>
              </div>
            </div>
            <div
              ref={bodyRef}
              contentEditable
              suppressContentEditableWarning
              onBlur={() => setBodyHTML(syncFromDOM())}
              className="prose-edit min-h-[200px] max-h-[40vh] overflow-y-auto scroll-thin
                         px-3 py-3 rounded-lg bg-ink-800 border border-ink-600 text-sm leading-relaxed
                         focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              style={{ color: "#d6dbe3" }}
            />
            <style>{`
              .prose-edit p { margin: 0 0 10px; }
              .prose-edit a { color: #b0a0ff; }
              .prose-edit img { max-width: 100%; border-radius: 6px; margin: 8px 0; }
              .prose-edit blockquote { border-left: 3px solid #7c5cff; padding-left: 12px; color: #c9d1dc; margin: 12px 0; }
              .prose-edit ul, .prose-edit ol { padding-left: 22px; margin: 0 0 10px; }
              .prose-edit code { background: #1b2026; padding: 2px 6px; border-radius: 4px; color: #ffd58a; }
            `}</style>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] uppercase tracking-widest font-bold text-ink-300">
                Immagini ({images.length})
              </label>
              <button
                onClick={addImage}
                className="text-[11px] text-ink-300 hover:text-brand-400 border border-dashed border-ink-600 hover:border-brand rounded-md px-2 py-1 flex items-center gap-1"
              >
                <ImageIcon size={12} /> Aggiungi immagine
              </button>
            </div>
            {images.length === 0 ? (
              <div className="text-[12px] text-ink-300 italic text-center py-6 border border-dashed border-ink-600 rounded-lg">
                Nessuna immagine in questa news.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {images.map((img) => (
                  <div
                    key={img.idx}
                    className="rounded-lg overflow-hidden border border-ink-600 bg-ink-800 flex flex-col"
                  >
                    <img
                      src={img.src}
                      alt={img.alt}
                      referrerPolicy="no-referrer"
                      className="w-full h-24 object-cover"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.opacity = "0.3")}
                    />
                    <div className="flex gap-1 p-1.5 bg-ink-900 border-t border-ink-600">
                      <button
                        type="button"
                        onClick={() => replaceImage(img.idx)}
                        className="flex-1 text-[10px] font-semibold py-1.5 px-1 rounded border border-ink-600 hover:bg-brand hover:border-brand hover:text-white text-ink-100 flex items-center justify-center gap-1 transition"
                        title="Cambia URL"
                      >
                        <Replace size={11} /> Cambia
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteImage(img.idx)}
                        className="flex-1 text-[10px] font-semibold py-1.5 px-1 rounded border border-ink-600 hover:bg-red-500 hover:border-red-500 hover:text-white text-ink-100 flex items-center justify-center gap-1 transition"
                        title="Elimina"
                      >
                        <Trash2 size={11} /> Elimina
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function escapeAttr(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
function escapeHTML(s: string) {
  return escapeAttr(s);
}
