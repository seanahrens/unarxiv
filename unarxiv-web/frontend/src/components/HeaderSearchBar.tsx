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
    <div className="w-full py-3 mb-px">
      <SearchBar onSearch={handleSearch} onArxivSubmit={handleArxivSubmit} hideHint />
    </div>
  );
}
