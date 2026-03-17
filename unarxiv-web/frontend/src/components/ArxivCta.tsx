"use client";

import UrlAnimation from "@/components/UrlAnimation";

interface ArxivCtaProps {
  query?: string;
  className?: string;
  showHeading?: boolean;
  inlineBrowse?: boolean;
  staticUrl?: boolean;
}

export default function ArxivCta({ query, className, showHeading = true, inlineBrowse = false, staticUrl = false }: ArxivCtaProps) {
  const searchUrl = query
    ? `https://arxiv.org/search/?query=${encodeURIComponent(query)}&searchtype=all`
    : "https://arxiv.org";
  const buttonLabel = query
    ? `Search for \u2018${query}\u2019 on arXiv.org`
    : "Browse papers on arXiv.org";

  const buttonStyle = inlineBrowse
    ? "inline-flex items-center gap-2 px-5 py-1.5 text-sm font-medium text-slate-400 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors no-underline whitespace-nowrap"
    : "inline-flex items-center gap-2 px-5 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-full transition-colors no-underline whitespace-nowrap";

  const browseButton = (
    <a
      href={searchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonStyle}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      {buttonLabel}
    </a>
  );

  return (
    <div className={`text-center ${className || "py-10"}`}>
      {showHeading && (
        <>
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
            Not seeing the paper you expect?
          </h3>
          <p className="text-sm text-slate-9000 max-w-md mx-auto mb-5">
            Find it on arXiv. Add &lsquo;un&rsquo; to the URL. We&rsquo;ll narrate it!
          </p>
        </>
      )}
      {inlineBrowse ? (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <UrlAnimation static={staticUrl} />
          {browseButton}
        </div>
      ) : (
        <>
          <div className="flex justify-center mb-5">
            <UrlAnimation static={staticUrl} />
          </div>
          {browseButton}
        </>
      )}
    </div>
  );
}
