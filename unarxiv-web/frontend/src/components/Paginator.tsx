"use client";

interface PaginatorProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export default function Paginator({ page, totalPages, onChange }: PaginatorProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(0, page - 1))}
        disabled={page === 0}
        className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-default transition-colors"
        aria-label="Previous page"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 12L6 8L10 4" />
        </svg>
      </button>
      <span className="text-xs text-stone-400 tabular-nums min-w-[3ch] text-center">
        {page + 1}/{totalPages}
      </span>
      <button
        onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-default transition-colors"
        aria-label="Next page"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4L10 8L6 12" />
        </svg>
      </button>
    </div>
  );
}
