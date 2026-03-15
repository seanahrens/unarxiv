"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { isArxivUrl } from "@/lib/api";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onArxivSubmit: (url: string) => void;
  initialQuery?: string;
  hideHint?: boolean;
}

export default function SearchBar({
  onSearch,
  onArxivSubmit,
  initialQuery = "",
  hideHint = false,
}: SearchBarProps) {
  const [value, setValue] = useState(initialQuery);
  const [isArxiv, setIsArxiv] = useState(false);
  const [focused, setFocused] = useState(false);
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

  const showPlaceholder = !value && !focused;

  return (
    <div className="w-full">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full px-4 py-3 text-base border border-stone-300 rounded-xl
                     focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent
                     bg-white shadow-sm"
        />
        {showPlaceholder && (
          <div className="absolute inset-0 flex items-center px-4 pointer-events-none text-base text-stone-400">
            <span className="hidden md:inline">Paste arXiv.org URL, arXiv ID, or Search Our Narrations</span>
            <span className="md:hidden">Paste arXiv URL, arXiv ID, or Search</span>
          </div>
        )}
      </div>
      {!hideHint && (
        <p className="mt-2 text-xs text-stone-400">
          {isArxiv ? (
            <span className="text-emerald-600 font-medium">
              arXiv paper detected — looking it up...
            </span>
          ) : (
            "Paste any arXiv URL or paper ID to generate a free audio narration"
          )}
        </p>
      )}
    </div>
  );
}
