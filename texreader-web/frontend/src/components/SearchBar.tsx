"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { isArxivUrl } from "@/lib/api";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onArxivSubmit: (url: string) => void;
  initialQuery?: string;
  hideHint?: boolean;
  submitDisabled?: boolean;
}

export default function SearchBar({
  onSearch,
  onArxivSubmit,
  initialQuery = "",
  hideHint = false,
  submitDisabled = false,
}: SearchBarProps) {
  const [value, setValue] = useState(initialQuery);
  const [isArxiv, setIsArxiv] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setIsArxiv(isArxivUrl(value));
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValue(v);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (isArxivUrl(v)) {
        // Auto-trigger arXiv lookup as soon as an ID is detected
        debounceRef.current = setTimeout(() => onArxivSubmit(v), 300);
      } else {
        debounceRef.current = setTimeout(() => onSearch(v), 300);
      }
    },
    [onSearch, onArxivSubmit]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isArxiv) {
        onArxivSubmit(value);
      } else {
        onSearch(value);
      }
    },
    [value, isArxiv, onSearch, onArxivSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="Search papers or paste an arXiv URL to narrate..."
          className="w-full px-4 py-3 pr-36 text-base border border-stone-300 rounded-xl
                     focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent
                     bg-white shadow-sm placeholder:text-stone-400"
        />
        <button
          type="submit"
          disabled={isArxiv && submitDisabled}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg
                      text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                      ${
                        isArxiv
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "bg-stone-800 hover:bg-stone-700"
                      }`}
        >
          {isArxiv ? "Fetch paper details" : "Search"}
        </button>
      </div>
      {!hideHint && (
        <p className="mt-2 text-xs text-stone-400">
          {isArxiv ? (
            <span className="text-emerald-600 font-medium">
              Possible arXiv paper detected — submit to fetch paper details
            </span>
          ) : (
            "Paste any arXiv URL or paper ID to generate a free audio narration"
          )}
        </p>
      )}
    </form>
  );
}
