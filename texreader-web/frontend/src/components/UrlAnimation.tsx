"use client";

import { useState, useEffect } from "react";

// Timing constants (ms) — tweak these to adjust the animation feel
const TYPE_DELAY = 200; // delay between typing each character
const PAUSE_AFTER_TYPING = 2000; // pause after "un" is fully typed
const DELETE_DELAY = 150; // delay between deleting each character
const PAUSE_AFTER_DELETE = 2000; // pause after "un" is fully deleted
const CURSOR_BLINK_RATE = 530; // cursor blink interval

type Phase = "typing_u" | "typing_n" | "pause_typed" | "deleting_n" | "deleting_u" | "pause_deleted";

function UrlBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`select-none pointer-events-none ${className || ""}`}>
      <div className="inline-flex items-center gap-2 bg-white border border-stone-200 rounded-full px-3 py-1.5 shadow-sm">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#78716c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className="text-[13px] text-stone-600 whitespace-nowrap font-sans mx-1">
          <span className="text-stone-400">https://</span>
          {children}
          <span>arxiv.org/abs/2411.09222</span>
        </span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </div>
    </div>
  );
}

function StaticUrlAnimation({ className }: { className?: string }) {
  return (
    <UrlBar className={className}>
      <span className="text-stone-900 bg-blue-200">un</span>
    </UrlBar>
  );
}

function AnimatedUrlAnimation({ className }: { className?: string }) {
  const [phase, setPhase] = useState<Phase>("pause_deleted");
  const [cursorVisible, setCursorVisible] = useState(true);

  // Cursor blink
  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), CURSOR_BLINK_RATE);
    return () => clearInterval(interval);
  }, []);

  // Phase state machine
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    switch (phase) {
      case "pause_deleted":
        timeout = setTimeout(() => setPhase("typing_u"), PAUSE_AFTER_DELETE);
        break;
      case "typing_u":
        timeout = setTimeout(() => setPhase("typing_n"), TYPE_DELAY);
        break;
      case "typing_n":
        timeout = setTimeout(() => setPhase("pause_typed"), TYPE_DELAY);
        break;
      case "pause_typed":
        timeout = setTimeout(() => setPhase("deleting_n"), PAUSE_AFTER_TYPING);
        break;
      case "deleting_n":
        timeout = setTimeout(() => setPhase("deleting_u"), DELETE_DELAY);
        break;
      case "deleting_u":
        timeout = setTimeout(() => setPhase("pause_deleted"), DELETE_DELAY);
        break;
    }

    return () => clearTimeout(timeout);
  }, [phase]);

  // Determine what's typed
  const hasU = phase === "typing_u" || phase === "typing_n" || phase === "pause_typed" || phase === "deleting_n";
  const hasN = phase === "typing_n" || phase === "pause_typed";
  const typed = hasU ? (hasN ? "un" : "u") : "";

  // Invisible spacer to keep width constant
  const spacer = !hasU ? (
    <span className="font-bold invisible" aria-hidden="true">un</span>
  ) : hasU && !hasN ? (
    <span className="font-bold invisible" aria-hidden="true">n</span>
  ) : null;

  const cursor = (
    <span
      className="inline-block w-[1.5px] h-[13px] bg-stone-800 align-middle"
      style={{ opacity: cursorVisible ? 1 : 0 }}
    />
  );

  return (
    <UrlBar className={className}>
      {typed && <span className="font-bold text-stone-900">{typed}</span>}
      {spacer}
      {cursor}
    </UrlBar>
  );
}

export default function UrlAnimation({ className, static: isStatic }: { className?: string; static?: boolean }) {
  if (isStatic) return <StaticUrlAnimation className={className} />;
  return <AnimatedUrlAnimation className={className} />;
}
