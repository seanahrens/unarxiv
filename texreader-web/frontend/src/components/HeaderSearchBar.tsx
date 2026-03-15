"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import SearchBar from "./SearchBar";

export default function HeaderSearchBar() {
  const router = useRouter();

  const handleSearch = useCallback(
    (query: string) => {
      if (query.trim()) {
        router.push(`/?q=${encodeURIComponent(query)}`);
      } else {
        router.push("/");
      }
    },
    [router]
  );

  const handleArxivSubmit = useCallback(
    (url: string) => {
      router.push(`/?arxiv=${encodeURIComponent(url)}`);
    },
    [router]
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-3 border-b border-stone-200/60">
      <SearchBar onSearch={handleSearch} onArxivSubmit={handleArxivSubmit} hideHint />
    </div>
  );
}
