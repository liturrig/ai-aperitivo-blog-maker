import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Pencil } from "lucide-react";
import type { NewsItem as NewsItemType } from "../lib/parser";

type Props = {
  item: NewsItemType;
  macroId: string;
  onDelete: () => void;
  onRename: () => void;
};

export function NewsItem({ item, macroId, onDelete, onRename }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "item", macroId },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex gap-2.5 items-start rounded-lg border bg-ink-800
        border-ink-600 hover:border-brand/60 hover:bg-ink-700 transition-colors
        px-2.5 py-2 ${isDragging ? "ring-2 ring-brand" : ""}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-ink-300 hover:text-ink-100 cursor-grab active:cursor-grabbing touch-none pt-1 shrink-0"
        aria-label="Drag"
      >
        <GripVertical size={14} />
      </button>

      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-14 h-14 rounded-md object-cover border border-ink-600 bg-ink-700 shrink-0"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`shrink-0 text-[9px] font-bold rounded px-1.5 py-0.5
              ${item.level === 2 ? "bg-brand/20 text-brand-400" : "bg-ink-600 text-ink-300"}`}
            title={`Heading H${item.level}`}
          >
            H{item.level}
          </span>
          <span className="font-medium text-[13px] text-ink-100 truncate">{item.title}</span>
        </div>
        {item.snippet && (
          <div className="text-[11px] text-ink-300 line-clamp-1">{item.snippet}</div>
        )}
      </div>

      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onRename}
          className="w-6 h-6 rounded border border-ink-600 hover:border-brand text-ink-300 hover:text-brand-400 flex items-center justify-center"
          title="Edit content"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={onDelete}
          className="w-6 h-6 rounded border border-ink-600 hover:border-red-500 text-ink-300 hover:text-red-400 flex items-center justify-center"
          title="Delete"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
