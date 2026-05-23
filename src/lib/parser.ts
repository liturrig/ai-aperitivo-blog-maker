export type NewsItem = {
  id: string;
  title: string;
  level: 2 | 3; // h2 or h3
  headingHTML: string;
  bodyHTML: string;
  imageUrl?: string;
  snippet: string;
  /** Id of the original `.columns-container` this item came from, if any.
   *  Adjacent items sharing this id are rendered side-by-side in the preview. */
  columnsGroupId?: string;
  custom?: boolean;
};

export type MacroSection = {
  id: string;
  title: string;
  headingHTML: string;
  introHTML: string;
  items: NewsItem[];
  custom?: boolean;
};

export type BlogModel = {
  preHTML: string;
  macros: MacroSection[];
  baseHref: string;
  originalHTML: string;
  header: { title: string; meta: string; heroImg: string };
};

export const PROXY_LOCAL = "local";

const PUBLIC_PROXIES = [
  "https://api.allorigins.win/raw?url=",
  "https://api.codetabs.com/v1/proxy/?quest=",
  "https://corsproxy.io/?url=",
];

// The Vite dev-server proxy only exists during `npm run dev`. On GitHub Pages
// (production build) it doesn't exist, so we expose only the public proxies
// and the default falls back to the first public one.
const IS_DEV = typeof import.meta !== "undefined" && (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;

export const PROXIES = IS_DEV ? [PROXY_LOCAL, ...PUBLIC_PROXIES] : [...PUBLIC_PROXIES];
export const PROXY_LABELS = IS_DEV
  ? ["Locale (Vite)", "allorigins.win", "codetabs.com", "corsproxy.io"]
  : ["allorigins.win", "codetabs.com", "corsproxy.io"];

function toLocalProxyURL(url: string): string {
  const u = new URL(url);
  if (!u.hostname.endsWith("aisocratic.org")) {
    throw new Error("Il proxy locale supporta solo URL di aisocratic.org. Cambia proxy o URL.");
  }
  return "/_aisocratic" + u.pathname + u.search;
}

export async function fetchHTML(url: string, proxy: string): Promise<string> {
  let target: string;
  if (proxy === PROXY_LOCAL) target = toLocalProxyURL(url);
  else if (proxy) target = proxy + encodeURIComponent(url);
  else target = url;
  const res = await fetch(target);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text || text.length < 500) throw new Error("Risposta vuota o troppo corta dal proxy.");
  return text;
}

function ensureBase(doc: Document, base: string) {
  let baseEl = doc.querySelector("base");
  if (!baseEl) {
    baseEl = doc.createElement("base");
    doc.head.prepend(baseEl);
  }
  baseEl.setAttribute("href", base);
}

function findProseContainer(doc: Document): HTMLElement | null {
  const candidates: HTMLElement[] = [
    ...Array.from(doc.querySelectorAll<HTMLElement>(".markdown-content")),
    ...Array.from(doc.querySelectorAll<HTMLElement>(".prose")),
  ];
  for (const c of candidates) {
    if (c.querySelectorAll(":scope > h1[id]").length >= 1) return c;
  }
  const all = doc.querySelectorAll<HTMLElement>("article, main, div, section");
  for (const c of Array.from(all)) {
    if (c.querySelectorAll(":scope > h1[id]").length >= 2) return c;
  }
  return null;
}

function nodesToHTML(nodes: Node[]): string {
  const wrap = document.createElement("div");
  nodes.forEach((n) => wrap.appendChild(n.cloneNode(true)));
  return wrap.innerHTML;
}

function firstImageURL(nodes: Node[]): string | undefined {
  for (const n of nodes) {
    if (n.nodeType !== 1) continue;
    const el = n as Element;
    const img = el.tagName === "IMG" ? (el as HTMLImageElement) : el.querySelector?.("img");
    if (img) {
      const src = img.getAttribute("src");
      if (src) return src;
    }
  }
  return undefined;
}

function nodesText(nodes: Node[], skipFirst = false): string {
  return nodes
    .slice(skipFirst ? 1 : 0)
    .map((n) => n.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Walk down to the most meaningful leaf text inside `el`, ignoring icon-only siblings.
 *  Returns the longest leaf text > 1 char, or el.textContent.trim() as fallback. */
function leafText(el: Element): string {
  const candidates = el.querySelectorAll("span, time, p, a");
  let best = "";
  for (const c of Array.from(candidates)) {
    const onlySvg = c.children.length === 1 && c.children[0].tagName.toLowerCase() === "svg";
    if (c.children.length === 0 || onlySvg) {
      const t = (c.textContent || "").trim();
      if (t.length > 1 && t.length > best.length) best = t;
    }
  }
  if (best) return best;
  // No nested leaf — use this element's text directly (excluding nothing since textContent already does)
  return (el.textContent || "").trim();
}

/** Extract author/date/read-time strip located right after the article title.
 *  Returns parts joined by " · ". */
function extractMetaStrip(titleEl: Element | undefined): string {
  if (!titleEl) return "";
  let metaWrap: Element | null = null;
  // Find the nearest sibling element after title containing "min read" text
  let sib = titleEl.nextElementSibling;
  let safety = 8;
  while (sib && safety-- > 0) {
    if ((sib.textContent || "").toLowerCase().includes("min read")) {
      metaWrap = sib;
      break;
    }
    sib = sib.nextElementSibling;
  }
  if (!metaWrap) return "";

  const parts: string[] = [];
  for (const child of Array.from(metaWrap.children)) {
    const t = leafText(child);
    if (t && t.length > 1 && !parts.includes(t)) parts.push(t);
  }
  return parts.join(" · ");
}

function extractHeader(doc: Document, baseHref: string) {
  const articles = Array.from(doc.querySelectorAll("article"));
  let article =
    articles.find((a) => a.querySelector(".markdown-content")) ||
    articles.find((a) => a.querySelector("h1[id]")) ||
    articles[0] ||
    null;
  if (article && !Array.from(article.querySelectorAll("h1")).some((h) => !h.id)) {
    const withTitle = articles.find((a) => Array.from(a.querySelectorAll("h1")).some((h) => !h.id));
    if (withTitle) article = withTitle;
  }
  let title = "";
  let meta = "";
  let heroImg = "";
  if (article) {
    const titleEl = Array.from(article.querySelectorAll("h1")).find((h) => !h.id);
    if (titleEl) title = (titleEl.textContent || "").trim();
    meta = extractMetaStrip(titleEl);
  }
  // Prefer the OpenGraph / Twitter cover image — it's the canonical hero.
  // Fall back to an image in the article header area (NOT one inside markdown-content,
  // which is a per-news image).
  const og =
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ||
    "";
  if (og) {
    heroImg = og;
  } else if (article) {
    // Pick the first <img> in the article that is NOT inside .markdown-content / .prose
    const candidates = Array.from(article.querySelectorAll("img"));
    const outsideContent = candidates.find(
      (img) => !img.closest(".markdown-content") && !img.closest(".prose")
    );
    if (outsideContent) heroImg = outsideContent.getAttribute("src") || "";
  }
  if (heroImg && !/^https?:/i.test(heroImg)) {
    try {
      heroImg = new URL(heroImg, baseHref).href;
    } catch {
      /* noop */
    }
  }
  return { title, meta, heroImg };
}

export function parseBlog(html: string, sourceURL: string): BlogModel {
  const doc = new DOMParser().parseFromString(html, "text/html");
  ensureBase(doc, sourceURL);

  const prose = findProseContainer(doc);
  if (!prose) throw new Error("Impossibile trovare il contenuto dell'articolo (.prose).");

  // Split into macros at every direct H1[id]
  const children = Array.from(prose.childNodes);
  const preNodes: Node[] = [];
  const macroBuckets: { headingEl: Element; nodes: Node[] }[] = [];
  let cur: { headingEl: Element; nodes: Node[] } | null = null;
  for (const n of children) {
    const isH1 = n.nodeType === 1 && (n as Element).tagName === "H1" && (n as Element).id;
    if (isH1) {
      if (cur) macroBuckets.push(cur);
      cur = { headingEl: n as Element, nodes: [] };
    } else if (cur) {
      cur.nodes.push(n);
    } else {
      preNodes.push(n);
    }
  }
  if (cur) macroBuckets.push(cur);
  if (macroBuckets.length === 0) throw new Error("Nessuna sezione H1 trovata.");

  const macros: MacroSection[] = macroBuckets.map((bucket) =>
    buildMacroFromBucket(bucket)
  );

  return {
    preHTML: nodesToHTML(preNodes),
    macros,
    baseHref: sourceURL,
    originalHTML: html,
    header: extractHeader(doc, sourceURL),
  };
}

function isItemHeading(node: Node): node is Element {
  if (node.nodeType !== 1) return false;
  const el = node as Element;
  return (el.tagName === "H2" || el.tagName === "H3") && !!el.id;
}

function containsItemHeading(el: Element): boolean {
  return !!el.querySelector?.("h2[id], h3[id]");
}

function nodeToHTMLString(node: Node): string {
  if (node.nodeType === 1) return (node as Element).outerHTML;
  if (node.nodeType === 3) return (node.textContent || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  return "";
}

/** Walk macro content in document order, splitting at every H2[id] or H3[id]
 *  wherever it appears (even nested inside layout wrappers like .columns-container). */
function buildMacroFromBucket(bucket: { headingEl: Element; nodes: Node[] }): MacroSection {
  const introParts: string[] = [];
  type ItemBucket = {
    headingEl: Element;
    level: 2 | 3;
    parts: string[];
    captureNodes: Node[];
    columnsGroupId?: string;
  };
  const items: ItemBucket[] = [];
  let cur: ItemBucket | null = null;
  let currentColumnsGroup: string | null = null;

  function pushChunk(html: string, captureNode?: Node) {
    if (cur) {
      cur.parts.push(html);
      if (captureNode) cur.captureNodes.push(captureNode);
    } else {
      introParts.push(html);
    }
  }

  function walk(node: Node) {
    if (isItemHeading(node)) {
      const el = node as Element;
      cur = {
        headingEl: el,
        level: el.tagName === "H2" ? 2 : 3,
        parts: [],
        captureNodes: [],
        columnsGroupId: currentColumnsGroup ?? undefined,
      };
      items.push(cur);
      return;
    }
    if (node.nodeType === 1 && containsItemHeading(node as Element)) {
      const el = node as Element;
      const isColumns = el.classList?.contains("columns-container");
      const prevGroup = currentColumnsGroup;
      if (isColumns && !currentColumnsGroup) currentColumnsGroup = uid("cols");
      for (const child of Array.from(node.childNodes)) walk(child);
      currentColumnsGroup = prevGroup;
      return;
    }
    pushChunk(nodeToHTMLString(node), node);
  }

  for (const n of bucket.nodes) walk(n);

  const newsItems: NewsItem[] = items.map((b) => ({
    id: b.headingEl.id || uid("item"),
    title: (b.headingEl.textContent || "").replace(/^#\s*/, "").trim(),
    level: b.level,
    headingHTML: b.headingEl.outerHTML,
    bodyHTML: b.parts.join(""),
    imageUrl: firstImageURL(b.captureNodes),
    snippet: nodesText(b.captureNodes).slice(0, 220),
    columnsGroupId: b.columnsGroupId,
  }));

  return {
    id: bucket.headingEl.id || uid("macro"),
    title: (bucket.headingEl.textContent || "").replace(/^#\s*/, "").trim(),
    headingHTML: bucket.headingEl.outerHTML,
    introHTML: introParts.join(""),
    items: newsItems,
  };
}

// ─── Builders for new items / macros ────────────────────────────────────────

export function newItem(title: string): NewsItem {
  const id = uid("item");
  return {
    id,
    title,
    level: 2,
    headingHTML: `<h2 id="${escapeAttr(id)}" class="news-heading">${escapeHtml(title)}</h2>`,
    bodyHTML: `<p class="news-empty"><em>Aggiungi qui il contenuto della notizia…</em></p>`,
    snippet: "",
    custom: true,
  };
}

export function newMacro(title: string): MacroSection {
  const id = uid("macro");
  return {
    id,
    title,
    headingHTML: `<h1 id="${escapeAttr(id)}" class="macro-heading">${escapeHtml(title)}</h1>`,
    introHTML: "",
    items: [],
    custom: true,
  };
}

// ─── Preview HTML builder ───────────────────────────────────────────────────

export function buildPreviewHTML(model: BlogModel, opts: { editMode?: boolean } = {}): string {
  const { header, baseHref, macros, preHTML } = model;
  const editMode = !!opts.editMode;

  const linksHTML = extractHeadLinks(model.originalHTML);

  const macrosHTML = macros
    .map((m) => {
      // Group adjacent items by columnsGroupId so original two-column layouts
      // are preserved when items stay next to each other after reordering.
      const groups: NewsItem[][] = [];
      for (const it of m.items) {
        const last = groups[groups.length - 1];
        if (
          last &&
          it.columnsGroupId &&
          last[last.length - 1].columnsGroupId === it.columnsGroupId
        ) {
          last.push(it);
        } else {
          groups.push([it]);
        }
      }
      const renderItem = (it: NewsItem) =>
        `<div class="news-item" data-item-id="${escapeAttr(it.id)}">${it.headingHTML}<div class="news-body" data-item-id="${escapeAttr(it.id)}">${it.bodyHTML}</div></div>`;
      const itemsHTML = groups
        .map((g) => {
          if (g.length >= 2 && g[0].columnsGroupId) {
            const cols = g
              .map((it) => `<div class="column">${renderItem(it)}</div>`)
              .join("");
            return `<div class="columns-container">${cols}</div>`;
          }
          return g.map(renderItem).join("\n");
        })
        .join("\n");
      return `<section class="macro" data-macro-id="${escapeAttr(m.id)}">
${m.headingHTML}
<div class="macro-intro" data-macro-id="${escapeAttr(m.id)}">${m.introHTML}</div>
${itemsHTML}
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base href="${escapeAttr(baseHref)}" target="_blank" />
<title>${escapeHtml(header.title || "Preview")}</title>
${linksHTML}
<style>
  :root {
    --bg: #0c0d11;
    --bg-elev: #15171d;
    --text: #e7ecf2;
    --muted: #9aa4b2;
    --border: #262d36;
    --brand: #7c5cff;
    --brand-2: #00d3a7;
    --link: #b0a0ff;
  }
  html, body { margin: 0; background: var(--bg); color: var(--text); }
  body {
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 880px; margin: 0 auto; padding: 56px 28px 96px; }
  .hero-card {
    position: relative; overflow: hidden;
    border-radius: 20px; border: 1px solid var(--border);
    background:
      radial-gradient(80% 120% at 0% 0%, rgba(124,92,255,0.22), transparent 60%),
      radial-gradient(80% 120% at 100% 100%, rgba(0,211,167,0.18), transparent 60%),
      linear-gradient(180deg, #181a22, #0f1116);
    padding: 40px 36px;
    margin-bottom: 40px;
  }
  .hero-meta {
    display: inline-flex; align-items: center; gap: 10px;
    font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--muted); margin-bottom: 18px;
  }
  .hero-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--brand); }
  .hero-title {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: clamp(36px, 5vw, 56px);
    font-weight: 700; letter-spacing: -0.025em; line-height: 1.05;
    color: #fff; margin: 0 0 18px;
    background: linear-gradient(180deg, #ffffff 0%, #c9c6e0 100%);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .hero-sub { color: var(--muted); font-size: 15px; max-width: 60ch; }
  .hero-img { width: 100%; border-radius: 14px; margin-top: 28px; display: block; }
  .toc {
    display: flex; flex-wrap: wrap; gap: 8px; margin: 28px 0 0;
  }
  .toc a {
    text-decoration: none;
    font-size: 12px; font-weight: 600;
    padding: 6px 12px; border-radius: 999px;
    background: rgba(124,92,255,0.12); color: #c9b8ff; border: 1px solid rgba(124,92,255,0.3);
    transition: background .15s;
  }
  .toc a:hover { background: rgba(124,92,255,0.22); }

  .macro {
    margin: 48px 0; padding-top: 8px;
    border-top: 1px solid var(--border);
  }
  .macro > h1, .macro-heading {
    font-size: 30px; font-weight: 700; letter-spacing: -0.01em;
    color: #fff; margin: 24px 0 14px;
    display: inline-flex; align-items: center; gap: 12px;
  }
  .macro > h1::before, .macro-heading::before {
    content: "";
    width: 6px; height: 26px; border-radius: 3px;
    background: linear-gradient(180deg, var(--brand), var(--brand-2));
  }
  .macro h2, .news-heading { font-size: 22px; font-weight: 600; margin: 24px 0 10px; color: #fff; }
  .macro h3 { font-size: 17px; font-weight: 600; margin: 20px 0 8px; color: #e7ecf2; }
  .macro h1 a, .macro h2 a, .macro h3 a { display: none; }

  p { margin: 0 0 14px; font-size: 16px; line-height: 1.65; color: #d6dbe3; }
  a { color: var(--link); }
  img { max-width: 100%; border-radius: 10px; margin: 10px 0; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 28px 0; }
  ul, ol { padding-left: 22px; margin: 0 0 14px; }
  li { margin: 4px 0; color: #d6dbe3; line-height: 1.6; }
  blockquote {
    border-left: 3px solid var(--brand);
    margin: 16px 0; padding: 6px 16px; color: #c9d1dc;
    background: #14181d; border-radius: 6px;
  }
  code { background: #1b2026; padding: 2px 6px; border-radius: 4px; font-size: 0.92em; color: #ffd58a; }
  pre { background: #14181d; padding: 14px; border-radius: 8px; overflow-x: auto; border: 1px solid var(--border); }
  pre code { background: transparent; padding: 0; color: inherit; }
  .columns-container { display: flex; gap: 1rem; margin: 1.5rem 0; flex-wrap: wrap; }
  .column { flex: 1; min-width: 240px; }
  .news-empty { color: var(--muted); font-style: italic; }

  /* Clickable images */
  .wrap img:not(.hero-img) { cursor: zoom-in; transition: transform .15s, box-shadow .15s; }
  .wrap img:not(.hero-img):hover { transform: translateY(-1px); box-shadow: 0 12px 32px rgba(0,0,0,0.4); }

  /* Edit mode */
  body.editing .editable {
    outline: 1px dashed rgba(124,92,255,0.4);
    outline-offset: 4px;
    border-radius: 4px;
    cursor: text;
    transition: outline-color .15s, background .15s;
  }
  body.editing .editable:hover { outline-color: var(--brand); }
  body.editing .editable:focus { outline: 2px solid var(--brand); outline-offset: 4px; background: rgba(124,92,255,0.05); }
  body.editing .macro-intro:empty::before {
    content: "Intro (clicca per scrivere…)";
    color: var(--muted); font-style: italic; opacity: 0.6;
  }
  body.editing .macro-intro { min-height: 28px; padding: 4px; }
  body.editing img { cursor: zoom-in; }
  body.editing .img-wrap {
    position: relative; display: inline-block; max-width: 100%;
    outline: 1px dashed transparent; outline-offset: 2px; border-radius: 8px;
  }
  body.editing .img-wrap:hover { outline-color: var(--brand); }

  /* Tiny tool buttons (only Replace / Delete) top-right */
  body.editing .img-tools {
    position: absolute; top: 6px; right: 6px;
    display: flex; gap: 4px; opacity: 0; transition: opacity .15s;
    z-index: 6; pointer-events: auto;
  }
  body.editing .img-wrap:hover .img-tools { opacity: 1; }
  body.editing .img-btn {
    background: rgba(0,0,0,0.8); color: #fff;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 6px; padding: 5px 8px; font-size: 10px; font-weight: 600;
    cursor: pointer; backdrop-filter: blur(4px); user-select: none;
  }
  body.editing .img-btn:hover { background: var(--brand); border-color: var(--brand); }
  body.editing .img-btn.delete:hover { background: #ef4444; border-color: #ef4444; }

  /* Resize handles on the 4 corners */
  body.editing .img-handle {
    position: absolute; width: 18px; height: 18px;
    background: var(--brand); border: 3px solid #fff; border-radius: 50%;
    z-index: 7; opacity: 0; transition: opacity .15s, transform .12s, box-shadow .12s;
    box-shadow: 0 2px 10px rgba(0,0,0,0.5);
    touch-action: none;
  }
  body.editing .img-wrap:hover .img-handle,
  body.editing .img-wrap.resizing .img-handle { opacity: 1; }
  body.editing .img-handle:hover { transform: scale(1.25); box-shadow: 0 4px 16px var(--brand); }
  body.editing .img-handle.nw { top: -9px; left: -9px; cursor: nwse-resize; }
  body.editing .img-handle.ne { top: -9px; right: -9px; cursor: nesw-resize; }
  body.editing .img-handle.sw { bottom: -9px; left: -9px; cursor: nesw-resize; }
  body.editing .img-handle.se { bottom: -9px; right: -9px; cursor: nwse-resize; }

  body.editing .img-size-badge {
    position: absolute; bottom: 10px; left: 10px;
    background: var(--brand); color: white;
    font-size: 12px; font-weight: 700; letter-spacing: 0.4px;
    padding: 5px 10px; border-radius: 8px; z-index: 8;
    pointer-events: none; box-shadow: 0 4px 14px rgba(0,0,0,0.5);
  }
  body.editing .img-wrap.resizing { outline-color: var(--brand) !important; outline-width: 2px; }
  body.editing .img-wrap.resizing img { user-select: none; }

  /* Layout switcher (image position) */
  body.editing .img-btn.layout {
    padding: 5px 8px; font-size: 12px; line-height: 1;
  }
  body.editing .img-btn.layout.active { background: var(--brand); border-color: var(--brand); }
  body.editing .edit-banner {
    position: fixed; top: 0; left: 0; right: 0; z-index: 9998;
    background: linear-gradient(90deg, #7c5cff, #00d3a7);
    color: #002a22; padding: 8px 16px; font-size: 12px; font-weight: 600;
    text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  body.editing .wrap { padding-top: 88px; }

  /* Lightbox overlay */
  #lightbox {
    position: fixed; inset: 0; background: rgba(0,0,0,0.92); backdrop-filter: blur(6px);
    display: none; align-items: center; justify-content: center; z-index: 9999; cursor: zoom-out;
    animation: fadeIn .18s ease;
  }
  #lightbox.open { display: flex; }
  #lightbox img { max-width: 92vw; max-height: 92vh; border-radius: 12px; box-shadow: 0 30px 80px rgba(0,0,0,0.6); }
  #lightbox .close {
    position: absolute; top: 16px; right: 18px;
    width: 38px; height: 38px; border-radius: 50%;
    background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2);
    cursor: pointer; font-size: 18px; line-height: 1; display: flex; align-items: center; justify-content: center;
  }
  #lightbox .close:hover { background: rgba(255,255,255,0.18); }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>
</head>
<body class="${editMode ? "editing" : ""}">
${editMode ? '<div class="edit-banner">✏️ Modalità modifica attiva · clicca testo o immagini per modificare · clicca fuori per salvare</div>' : ""}
<div class="wrap">
  <header class="hero-card">
    <div class="hero-meta">
      <span class="hero-dot"></span>
      <span>${escapeHtml(header.meta || "AI Socratic · Monthly")}</span>
    </div>
    <h1 class="hero-title">${escapeHtml(header.title || "Preview")}</h1>
    ${
      macros.length
        ? `<nav class="toc">${macros
            .map(
              (m) =>
                `<a href="#${escapeAttr(m.id)}" target="_self">${escapeHtml(m.title)}</a>`
            )
            .join("")}</nav>`
        : ""
    }
    ${header.heroImg ? `<img class="hero-img" src="${escapeAttr(header.heroImg)}" alt="" />` : ""}
  </header>

  ${preHTML}
  ${macrosHTML}
</div>

<div id="lightbox" role="dialog" aria-modal="true" aria-label="Immagine ingrandita">
  <button class="close" aria-label="Chiudi">&times;</button>
  <img alt="" />
</div>

<script>
(function () {
  var editMode = ${editMode ? "true" : "false"};
  var lb = document.getElementById('lightbox');
  var lbImg = lb.querySelector('img');
  function openLB(src, alt) {
    lbImg.src = src; lbImg.alt = alt || '';
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeLB() {
    lb.classList.remove('open');
    lbImg.src = '';
    document.body.style.overflow = '';
  }
  lb.addEventListener('click', function (e) {
    if (e.target === lb || e.target.classList.contains('close')) closeLB();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLB();
  });

  if (!editMode) {
    // View mode: clicking images opens lightbox
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && !t.classList.contains('hero-img') && !t.closest('#lightbox')) {
        e.preventDefault();
        openLB(t.currentSrc || t.src, t.alt);
      }
    });
  } else {
    // Edit mode: enable contenteditable on titles, intros, bodies + image tools
    function postMsg(msg) {
      try { parent.postMessage(msg, '*'); } catch (e) {}
    }
    function readTitleText(el) {
      // Strip leading '#' that comes from hidden permalink anchors like <a aria-hidden>#</a>
      return el.textContent.replace(/^[#\s]+/, '').trim();
    }
    // Remove permalink anchors from all headings (they only add visual "#" prefix)
    document.querySelectorAll('h1 a[aria-hidden], h2 a[aria-hidden], h3 a[aria-hidden]').forEach(function (a) { a.remove(); });

    function makeEditable(el, onCommit) {
      el.classList.add('editable');
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'false');
      var last = onCommit.read(el);
      el.addEventListener('blur', function () {
        var now = onCommit.read(el);
        if (now !== last) { last = now; onCommit.send(el, now); }
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') el.blur();
      });
    }

    // Post title
    var postTitle = document.querySelector('.hero-title');
    if (postTitle) {
      makeEditable(postTitle, {
        read: readTitleText,
        send: function (_el, text) { postMsg({ type: 'post-title', text: text }); },
      });
    }

    // Macro headings (H1 inside .macro)
    document.querySelectorAll('.macro').forEach(function (sec) {
      var h1 = sec.querySelector(':scope > h1');
      var macroId = sec.dataset.macroId;
      if (h1 && macroId) {
        makeEditable(h1, {
          read: readTitleText,
          send: function (_el, text) { postMsg({ type: 'macro-title', id: macroId, text: text }); },
        });
      }
    });

    // Macro intros (content between H1 macro and first sub-news)
    document.querySelectorAll('.macro-intro').forEach(function (intro) {
      var macroId = intro.dataset.macroId;
      if (!macroId) return;
      makeEditable(intro, {
        read: function (el) { return el.innerHTML; },
        send: function (el, _html) { postMsg({ type: 'macro-intro', id: macroId, html: cleanInner(el) }); },
      });
    });

    // News item headings (H2/H3 inside .news-item)
    document.querySelectorAll('.news-item').forEach(function (item) {
      var heading = item.querySelector(':scope > h2, :scope > h3');
      var itemId = item.dataset.itemId;
      if (heading && itemId) {
        makeEditable(heading, {
          read: readTitleText,
          send: function (_el, text) { postMsg({ type: 'item-title', id: itemId, text: text }); },
        });
      }
    });

    // News bodies
    document.querySelectorAll('.news-body').forEach(function (body) {
      makeEditable(body, {
        read: function (el) { return el.innerHTML; },
        send: function (el, _html) { postMsg({ type: 'item-edit', id: el.dataset.itemId, html: cleanInner(el) }); },
      });
    });
    /** Build clean innerHTML for the model — strips edit-only decorations (.img-wrap, .img-tools, .editable). */
    function cleanInner(container) {
      var clone = container.cloneNode(true);
      // Unwrap .img-wrap: move <img> out, then drop the wrap (and its .img-tools child)
      clone.querySelectorAll('.img-wrap').forEach(function (w) {
        var img = w.querySelector('img');
        if (img && w.parentNode) {
          // Transfer wrap size onto the img so the saved HTML keeps the resize visually
          var wrapW = w.style.width;
          var wrapMax = w.style.maxWidth;
          if (wrapW) { img.style.width = wrapW; }
          if (wrapMax) { img.style.maxWidth = wrapMax; }
          if (wrapW || wrapMax) { img.style.height = 'auto'; }
          // Otherwise strip the 100%/100% we forced during edit mode
          if (!wrapW && !wrapMax) {
            if (img.style.width === '100%') img.style.width = '';
            if (img.style.maxWidth === '100%') img.style.maxWidth = '';
            if (img.style.height === 'auto') img.style.height = '';
          }
          w.parentNode.insertBefore(img, w);
        }
        w.remove();
      });
      clone.querySelectorAll('.img-tools, .img-handle').forEach(function (t) { t.remove(); });
      clone.querySelectorAll('.drop-target').forEach(function (e) {
        e.classList.remove('drop-target', 'drop-active', 'drop-top', 'drop-bottom', 'drop-left', 'drop-right');
        if (e.className === '') e.removeAttribute('class');
      });
      // Strip helper classes/attrs added by edit-mode init
      clone.querySelectorAll('.editable').forEach(function (e) { e.classList.remove('editable'); });
      clone.querySelectorAll('[contenteditable]').forEach(function (e) { e.removeAttribute('contenteditable'); });
      clone.querySelectorAll('[spellcheck]').forEach(function (e) { e.removeAttribute('spellcheck'); });
      return clone.innerHTML;
    }
    function commitContainer(container) {
      if (!container) return;
      var html = cleanInner(container);
      if (container.classList.contains('news-body')) {
        postMsg({ type: 'item-edit', id: container.dataset.itemId, html: html });
      } else {
        postMsg({ type: 'macro-intro', id: container.dataset.macroId, html: html });
      }
    }
    function makeImgBtn(label, variant, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'img-btn' + (variant ? ' ' + variant : '');
      b.textContent = label;
      b.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        onClick();
      });
      return b;
    }
    /** Remove empty .column children; if a .columns-container has only one .column
     *  remaining, unwrap so its content fills the full width. Also drops empty <p>s. */
    function cleanupColumns(container) {
      if (!container) return;
      // Remove empty <p> elements inside the container
      container.querySelectorAll('p').forEach(function (p) {
        if (!p.textContent.trim() && !p.querySelector('img,video,iframe')) p.remove();
      });
      container.querySelectorAll('.columns-container').forEach(function (cc) {
        cc.querySelectorAll(':scope > .column').forEach(function (c) {
          if (!c.textContent.trim() && !c.querySelector('img,video,iframe')) c.remove();
        });
        var remaining = cc.querySelectorAll(':scope > .column');
        if (remaining.length === 0) {
          cc.remove();
        } else if (remaining.length === 1) {
          var only = remaining[0];
          while (only.firstChild) cc.parentNode.insertBefore(only.firstChild, cc);
          cc.remove();
        }
      });
    }
    // Image setup: 4 corner resize handles + 3 layout buttons (Full / Left / Right) + Cambia / Elimina
    function imageBlock(wrap) {
      var p = wrap.parentElement;
      if (p && p.tagName === 'P' && p.children.length === 1 && p.children[0] === wrap &&
          !(p.textContent || '').replace(wrap.textContent || '', '').trim()) return p;
      return wrap;
    }
    function isTextBlock(el) {
      if (!el || el.nodeType !== 1) return false;
      var tag = el.tagName;
      if (['P','UL','OL','BLOCKQUOTE','PRE','H2','H3','H4'].indexOf(tag) < 0) return false;
      if (el.classList && (el.classList.contains('columns-container') || el.classList.contains('column'))) return false;
      if (el.querySelector && el.querySelector('img')) return false;
      return (el.textContent || '').trim().length > 0;
    }
    function findAdjacentText(block) {
      var n = block.nextElementSibling;
      while (n) {
        if (isTextBlock(n)) return n;
        if (n.classList && (n.classList.contains('columns-container'))) break;
        n = n.nextElementSibling;
      }
      var p = block.previousElementSibling;
      while (p) {
        if (isTextBlock(p)) return p;
        if (p.classList && (p.classList.contains('columns-container'))) break;
        p = p.previousElementSibling;
      }
      return null;
    }
    function pullOutOfColumns(wrap) {
      var block = imageBlock(wrap);
      var cc = wrap.closest('.columns-container');
      if (!cc) return block;
      var col = wrap.closest('.column');
      var otherCol = null;
      Array.from(cc.children).forEach(function (c) {
        if (c.classList && c.classList.contains('column') && c !== col) otherCol = c;
      });
      var parent = cc.parentNode;
      if (block.parentNode) block.parentNode.removeChild(block);
      if (otherCol) {
        while (otherCol.firstChild) parent.insertBefore(otherCol.firstChild, cc);
      }
      parent.insertBefore(block, cc);
      cc.remove();
      // Reset any column-flex sizing on the wrap itself; the resize % goes back onto wrap
      return block;
    }
    function setImageLayout(wrap, layout) {
      var container = wrap.closest('.news-body, .macro-intro');
      var existingCC = wrap.closest('.columns-container');

      // Fast path: already in 2 columns and just swapping sides → just rearrange
      if (existingCC && (layout === 'left' || layout === 'right')) {
        var col = wrap.closest('.column');
        var cols = Array.from(existingCC.children).filter(function (c) {
          return c.classList && c.classList.contains('column');
        });
        var imgIdx = cols.indexOf(col);
        var targetIdx = layout === 'left' ? 0 : cols.length - 1;
        if (col && imgIdx !== targetIdx && imgIdx >= 0) {
          if (targetIdx === 0) existingCC.insertBefore(col, existingCC.firstChild);
          else existingCC.appendChild(col);
        }
        cleanupColumns(container);
        commitContainer(container);
        return;
      }

      // Otherwise: dissolve any existing columns, then build the requested layout
      var block = pullOutOfColumns(wrap);
      if (layout === 'full') {
        cleanupColumns(container);
        commitContainer(container);
        return;
      }
      var text = findAdjacentText(block);
      if (text && text.parentNode) text.remove();
      else {
        text = document.createElement('p');
        text.innerHTML = '<em>Scrivi qui il testo…</em>';
      }
      var newCc = document.createElement('div');
      newCc.className = 'columns-container';
      var colImg = document.createElement('div');
      colImg.className = 'column';
      var wrapWidth = wrap.style.width;
      if (wrapWidth && wrapWidth !== '100%') {
        colImg.style.flex = '0 0 ' + wrapWidth;
        colImg.style.maxWidth = wrapWidth;
        wrap.style.width = '100%';
        wrap.style.maxWidth = '100%';
      }
      var colText = document.createElement('div');
      colText.className = 'column';
      var parent = block.parentNode;
      parent.insertBefore(newCc, block);
      if (layout === 'left') { newCc.appendChild(colImg); newCc.appendChild(colText); }
      else { newCc.appendChild(colText); newCc.appendChild(colImg); }
      colImg.appendChild(block);
      colText.appendChild(text);
      cleanupColumns(container);
      commitContainer(container);
    }
    function currentLayout(wrap) {
      var cc = wrap.closest('.columns-container');
      if (!cc) return 'full';
      var col = wrap.closest('.column');
      var cols = Array.from(cc.children).filter(function (c) { return c.classList && c.classList.contains('column'); });
      var idx = cols.indexOf(col);
      if (idx === 0) return 'left';
      if (idx > 0) return 'right';
      return 'full';
    }

    document.querySelectorAll('.news-body img, .macro-intro img').forEach(function (img) {
      if (img.parentElement && img.parentElement.classList.contains('img-wrap')) return;
      var wrap = document.createElement('span');
      wrap.className = 'img-wrap';
      wrap.contentEditable = 'false';
      img.parentNode.insertBefore(wrap, img);
      wrap.appendChild(img);

      // Move any pre-existing %-width from img onto the wrap; img fills the wrap.
      var existingW = (img.style.width || '').match(/^([0-9.]+)%$/);
      if (existingW) {
        wrap.style.width = existingW[0];
        wrap.style.maxWidth = existingW[0];
      }
      img.style.width = '100%';
      img.style.height = 'auto';
      img.style.maxWidth = '100%';

      var container = wrap.closest('.news-body, .macro-intro');

      // Toolbar: 3 layout buttons + Cambia / Elimina
      var tools = document.createElement('span');
      tools.className = 'img-tools';
      tools.contentEditable = 'false';

      function refreshLayoutActive() {
        var cur = currentLayout(wrap);
        Array.from(tools.querySelectorAll('.img-btn.layout')).forEach(function (b) {
          if (b.dataset.layout === cur) b.classList.add('active');
          else b.classList.remove('active');
        });
      }
      function applyLayout(layout) {
        setImageLayout(wrap, layout);
        refreshLayoutActive();
      }
      var fullBtn = makeImgBtn('▭ Largo', 'layout', function () { applyLayout('full'); });
      fullBtn.dataset.layout = 'full';
      fullBtn.title = 'Immagine a tutta larghezza';
      var leftBtn = makeImgBtn('◧ Sx', 'layout', function () { applyLayout('left'); });
      leftBtn.dataset.layout = 'left';
      leftBtn.title = 'Immagine a sinistra, testo a destra';
      var rightBtn = makeImgBtn('◨ Dx', 'layout', function () { applyLayout('right'); });
      rightBtn.dataset.layout = 'right';
      rightBtn.title = 'Immagine a destra, testo a sinistra';
      tools.appendChild(fullBtn);
      tools.appendChild(leftBtn);
      tools.appendChild(rightBtn);

      tools.appendChild(makeImgBtn('✎ Cambia', '', function () {
        var url = prompt('Nuovo URL immagine:', img.src);
        if (url) { img.src = url; commitContainer(container); }
      }));
      tools.appendChild(makeImgBtn('✕ Elimina', 'delete', function () {
        if (confirm('Eliminare questa immagine?')) {
          var block = imageBlock(wrap);
          block.remove();
          cleanupColumns(container);
          commitContainer(container);
        }
      }));
      wrap.appendChild(tools);
      refreshLayoutActive();

      // Resize handles on 4 corners — pointer capture, dual-axis sensitivity, aspect ratio preserved
      ['nw', 'ne', 'sw', 'se'].forEach(function (corner) {
        var h = document.createElement('span');
        h.className = 'img-handle ' + corner;
        h.contentEditable = 'false';
        h.addEventListener('pointerdown', function (e) {
          e.preventDefault(); e.stopPropagation();
          try { h.setPointerCapture(e.pointerId); } catch (_) {}
          wrap.classList.add('resizing');
          // Temporarily disable image native drag while resizing
          img.setAttribute('draggable', 'false');

          var startX = e.clientX;
          var startY = e.clientY;
          var startRect = wrap.getBoundingClientRect();
          var startWidthPx = startRect.width;
          var aspectRatio = startRect.width / Math.max(1, startRect.height);
          var containerEl = wrap.parentElement && wrap.parentElement.tagName === 'P'
            ? (wrap.closest('.column') || container)
            : (wrap.closest('.column') || container);
          var containerWidth = containerEl.getBoundingClientRect().width || startWidthPx;
          // Cap maximum width at the image's natural size to avoid pixelated upscaling
          var natural = img.naturalWidth || containerWidth;
          var maxWidthPx = Math.min(containerWidth, natural);
          var sx = (corner === 'ne' || corner === 'se') ? 1 : -1;
          var sy = (corner === 'sw' || corner === 'se') ? 1 : -1;

          var badge = document.createElement('span');
          badge.className = 'img-size-badge';
          wrap.appendChild(badge);

          function update(clientX, clientY) {
            var dx = clientX - startX;
            var dy = clientY - startY;
            var delta = (sx * dx + sy * dy * aspectRatio) / 2;
            var newWidthPx = Math.max(40, Math.min(maxWidthPx, startWidthPx + delta));
            var pct = Math.round((newWidthPx / containerWidth) * 100);
            pct = Math.min(100, Math.max(8, pct));
            // Resize the WRAP (which is sized to the parent block), not the img directly.
            // img stays at 100% of wrap so the wrap accurately reflects the visual image area.
            wrap.style.width = pct + '%';
            wrap.style.maxWidth = pct + '%';
            img.style.width = '100%';
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            badge.textContent = pct + '%';
          }
          function onMove(ev) { update(ev.clientX, ev.clientY); }
          function cleanup() {
            h.removeEventListener('pointermove', onMove);
            h.removeEventListener('pointerup', onUp);
            h.removeEventListener('pointercancel', onUp);
            try { h.releasePointerCapture(e.pointerId); } catch (_) {}
            wrap.classList.remove('resizing');
            img.setAttribute('draggable', 'true');
            if (badge.parentNode) badge.remove();
          }
          function onUp() { cleanup(); commitContainer(container); }
          h.addEventListener('pointermove', onMove);
          h.addEventListener('pointerup', onUp);
          h.addEventListener('pointercancel', onUp);
          update(e.clientX, e.clientY);
        });
        wrap.appendChild(h);
      });

      // Disable native HTML5 drag — layout is changed via the three layout buttons
      img.setAttribute('draggable', 'false');
    });

    // (drag-to-reposition removed — layout now via toolbar buttons)
  }
})();
</script>
</body>
</html>`;
}

function extractHeadLinks(originalHTML: string): string {
  try {
    const doc = new DOMParser().parseFromString(originalHTML, "text/html");
    const out: string[] = [];
    doc.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"]').forEach((el) => {
      out.push(el.outerHTML);
    });
    return out.join("\n");
  } catch {
    return "";
  }
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
function escapeAttr(s: string) {
  return escapeHtml(s);
}
