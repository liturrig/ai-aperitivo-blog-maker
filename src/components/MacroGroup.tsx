import { useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, Pencil } from "lucide-react";
import type { MacroSection } from "../lib/parser";
import { NewsItem } from "./NewsItem";

type Props = {
  macro: MacroSection;
  index: number;
  onRenameMacro: () => void;
  onDeleteMacro: () => void;
  onAddItem: () => void;
  onRenameItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
};

export function MacroGroup({
  macro,
  index,
  onRenameMacro,
  onDeleteMacro,
  onAddItem,
  onRenameItem,
  onDeleteItem,
}: Props) {
  const introText = useMemo(() => {
    if (!macro.introHTML) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = macro.introHTML;
    return (tmp.textContent || "").replace(/\s+/g, " ").trim();
  }, [macro.introHTML]);
  const introImg = useMemo(() => {
    if (!macro.introHTML) return undefined;
    const tmp = document.createElement("div");
    tmp.innerHTML = macro.introHTML;
    const img = tmp.querySelector("img");
    return img?.getAttribute("src") || undefined;
  }, [macro.introHTML]);
  const sortable = useSortable({
    id: macro.id,
    data: { type: "macro" },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${macro.id}`,
    data: { type: "macroDrop", macroId: macro.id },
  });

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };

  const itemIds = macro.items.map((i) => i.id);

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={`rounded-2xl border bg-gradient-to-b from-ink-800 to-ink-900
        ${sortable.isDragging ? "border-brand ring-2 ring-brand/40" : "border-ink-600"}`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-ink-600 bg-ink-800 rounded-t-2xl">
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          className="text-ink-300 hover:text-ink-100 cursor-grab active:cursor-grabbing touch-none shrink-0"
          aria-label="Trascina macro-sezione"
        >
          <GripVertical size={16} />
        </button>
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-md
                     bg-gradient-to-br from-brand to-mint text-white text-[11px] font-bold shrink-0"
        >
          {index + 1}
        </span>
        <h3 className="flex-1 font-semibold text-[14px] text-ink-100 truncate">{macro.title}</h3>
        <span className="text-[10px] text-ink-300 px-1.5 py-0.5 rounded bg-ink-700 shrink-0">
          {macro.items.length} {macro.items.length === 1 ? "news" : "news"}
        </span>
        <button
          onClick={onRenameMacro}
          className="w-7 h-7 rounded-md border border-ink-600 hover:border-brand text-ink-300 hover:text-brand-400 flex items-center justify-center shrink-0"
          title="Rinomina"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={onDeleteMacro}
          className="w-7 h-7 rounded-md border border-ink-600 hover:border-red-500 text-ink-300 hover:text-red-400 flex items-center justify-center shrink-0"
          title="Elimina macro-sezione"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div
        ref={setDropRef}
        className={`p-2 flex flex-col gap-1.5 min-h-[44px] rounded-b-2xl transition-colors
          ${isOver ? "bg-brand/5" : ""}`}
      >
        {introText ? (
          <div
            onClick={onRenameMacro}
            className="group/intro flex gap-2 items-start rounded-lg border border-dashed border-ink-600
                       bg-ink-800/50 hover:bg-ink-700 hover:border-brand/60 transition-colors
                       px-2.5 py-2 cursor-pointer"
            title="Modifica intro della sezione"
          >
            <span className="shrink-0 text-[9px] font-bold rounded px-1.5 py-0.5 bg-gradient-to-r from-brand/30 to-mint/30 text-white mt-0.5">
              INTRO
            </span>
            {introImg && (
              <img
                src={introImg}
                alt=""
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-md object-cover border border-ink-600 bg-ink-700 shrink-0"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-ink-300 line-clamp-2">{introText}</div>
            </div>
            <Pencil
              size={12}
              className="text-ink-300 opacity-0 group-hover/intro:opacity-100 transition-opacity mt-1 shrink-0"
            />
          </div>
        ) : (
          <button
            onClick={onRenameMacro}
            className="self-start text-[11px] text-ink-300 hover:text-brand-400
                       border border-dashed border-ink-600 hover:border-brand
                       rounded-md px-2 py-1 flex items-center gap-1 transition"
            title="Aggiungi un'intro a questa sezione"
          >
            <Plus size={12} /> Aggiungi intro
          </button>
        )}
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {macro.items.length === 0 ? (
            <div className="text-[11px] text-ink-300 italic px-2 py-3 text-center border border-dashed border-ink-600 rounded-lg">
              Trascina qui una news o usa “+ Aggiungi news”.
            </div>
          ) : (
            macro.items.map((it) => (
              <NewsItem
                key={it.id}
                item={it}
                macroId={macro.id}
                onDelete={() => onDeleteItem(it.id)}
                onRename={() => onRenameItem(it.id)}
              />
            ))
          )}
        </SortableContext>

        <button
          onClick={onAddItem}
          className="mt-1 self-start text-[11px] text-ink-300 hover:text-brand-400
                     border border-dashed border-ink-600 hover:border-brand
                     rounded-md px-2 py-1 flex items-center gap-1 transition"
        >
          <Plus size={12} /> Aggiungi news
        </button>
      </div>
    </div>
  );
}
