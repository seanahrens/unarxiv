"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { isArxivUrl } from "@/lib/api";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onArxivSubmit: (url: string) => void;
  initialQuery?: string;
  hideHint?: boolean;
}

const VISITED_KEY = "unarxiv_visited";

export default function SearchBar({
  onSearch,
  onArxivSubmit,
  initialQuery = "",
  hideHint = false,
}: SearchBarProps) {
  const [value, setValue] = useState(initialQuery);
  const [isArxiv, setIsArxiv] = useState(false);
  const [focused, setFocused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shouldPulse, setShouldPulse] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setIsArxiv(isArxivUrl(value));
  }, [value]);

  // Check first-time visitor
  useEffect(() => {
    try {
      if (!localStorage.getItem(VISITED_KEY)) {
        setShouldPulse(true);
      }
    } catch {}
  }, []);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => !prev);
    // Mark as visited on first tap
    if (shouldPulse) {
      setShouldPulse(false);
      try {
        localStorage.setItem(VISITED_KEY, "1");
      } catch {}
    }
  }, [shouldPulse]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValue(v);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (isArxivUrl(v)) {
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
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full pl-10 pr-11 py-3 text-base border border-stone-300 rounded-xl
                     focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent
                     bg-white shadow-sm"
        />
        {showPlaceholder && (
          <div className="absolute inset-0 flex items-center pl-10 pr-11 pointer-events-none text-base text-stone-400">
            <span className="hidden md:inline">Paste arXiv.org URL, arXiv ID, or Search Our Narrations</span>
            <span className="md:hidden">Paste arXiv URL, arXiv ID, or Search</span>
          </div>
        )}
        {/* Help icon */}
        <button
          type="button"
          onClick={toggleDrawer}
          aria-label="How does unarXiv work?"
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center
                      rounded-full bg-stone-400 text-white text-sm font-bold leading-none
                      hover:bg-stone-500 transition-colors focus:outline-none
                      ${shouldPulse ? "animate-help-pulse" : ""}`}
        >
          ?
        </button>
      </div>

      {/* Info drawer */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          drawerOpen ? "max-h-60 opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
        }`}
      >
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-sm text-stone-600">
          <p className="font-semibold text-stone-800 mb-1">How does unarXiv work?</p>
          <p className="mb-2">
            We are an audio arXiv — a mirrored repository of papers on arXiv in audiobook format.
            For a paper to be on unarXiv, it first needs to be added.
          </p>
          <p className="font-semibold text-stone-800 text-xs uppercase tracking-wide mb-2">
            To add a paper, drop the arXiv URL in the search above — or browse to an arxiv.org paper &amp; add &lsquo;un&rsquo; to the URL &amp; hit enter.
          </p>
          <a
            href="https://arxiv.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-500 hover:text-stone-700 underline text-xs"
          >
            Browse papers on arXiv.org &rarr;
          </a>
        </div>
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

      {/* Pulse keyframes injected once */}
      {shouldPulse && (
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes help-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(120, 113, 108, 0.5); }
            50% { box-shadow: 0 0 0 6px rgba(120, 113, 108, 0); }
          }
          .animate-help-pulse { animation: help-pulse 2s ease-in-out infinite; }
        `}} />
      )}
    </div>
  );
}
